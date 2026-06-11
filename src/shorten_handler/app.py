# This file creates short links for authenticated users.
# It validates URLs, prevents duplicates, and saves links in DynamoDB.
# It also prepares expiry and restore timing for each saved link.
import hashlib
import ipaddress
import json
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import boto3
import jwt
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


dynamodb = boto3.resource("dynamodb")
links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
JWT_SECRET = os.environ["JWT_SECRET"]
BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
URL_RE = re.compile(r"^https?://", re.IGNORECASE)
CUSTOM_CODE_RE = re.compile(r"^[A-Za-z0-9]{3,20}$")
TITLE_MAX_LENGTH = 80
RESTORE_GRACE_DAYS = 7

# This function returns the CORS headers used by every shorten response.
def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    }

# This function reads and verifies a bearer token from the request headers.
def verify_token(event):
    try:
        headers = event.get("headers") or {}
        auth_header = headers.get("Authorization") or headers.get("authorization") or ""
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header.split(" ")[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception as exc:
        logger.error(f"verify_token failed: {exc}")
        return None

# This function returns a standard unauthorized response body.
def unauthorized():
    return {
        "statusCode": 401,
        "headers": cors_headers(),
        "body": json.dumps({"error": "Unauthorized - please login"}),
    }

# This function builds a JSON API response with CORS headers.
def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": cors_headers(),
        "body": json.dumps(body),
    }

# This function parses the incoming JSON request body.
def parse_body(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raise ValueError("Base64 encoded payloads are not supported")
    return json.loads(body)

# This function adds https to URLs when the user omits the scheme.
def normalize_long_url(long_url):
    normalized = long_url.strip()
    # This condition adds a default scheme when the user pasted a plain domain.
    if normalized and not URL_RE.match(normalized):
        normalized = f"https://{normalized}"
    return normalized


# This function checks whether a URL is valid enough to save.
def is_valid_long_url(long_url):
    try:
        parsed = urlparse(long_url)
        # This condition rejects URLs that are not http or https.
        if parsed.scheme not in {"http", "https"}:
            return False
        # This condition rejects empty or malformed hosts.
        if not parsed.netloc or " " in parsed.netloc:
            return False

        hostname = parsed.hostname
        # This condition rejects URLs that do not have a hostname.
        if not hostname:
            return False
        # This condition allows localhost for local testing.
        if hostname == "localhost":
            return True

        try:
            ipaddress.ip_address(hostname)
            return True
        except ValueError:
            pass

        return "." in hostname and not hostname.startswith(".") and not hostname.endswith(".")
    except Exception as exc:
        logger.error(f"is_valid_long_url failed: {exc}")
        return False


# This function creates a deterministic short code from the long URL.
def generate_short_code(long_url):
    md5_hash = hashlib.md5(long_url.encode("utf-8")).hexdigest()
    return "".join(BASE62_CHARS[int(char, 16)] for char in md5_hash[:8])

# This function builds the public short URL returned to the frontend.
def build_short_url(event, code):
    headers = event.get("headers") or {}
    domain = headers.get("Host") or headers.get("host") or ""
    stage = event.get("requestContext", {}).get("stage")
    base_path = f"https://{domain}"
    # This condition adds the API stage name when the API is not using the default stage.
    if stage and stage != "$default":
        base_path = f"{base_path}/{stage}"
    return f"{base_path}/s/{code}" if domain else f"/s/{code}"


# This function detects when the user pasted an already-shortened LinkVault URL.
def is_existing_short_url(event, long_url):
    try:
        parsed = urlparse(long_url)
        headers = event.get("headers") or {}
        request_host = (headers.get("Host") or headers.get("host") or "").lower()
        parsed_host = (parsed.netloc or "").lower()
        stage = event.get("requestContext", {}).get("stage")
        normalized_path = parsed.path.rstrip("/")

        # This condition stops the match when the pasted URL is from another host.
        if not request_host or parsed_host != request_host:
            return False

        # This condition checks the shortened path format for staged APIs.
        if stage and stage != "$default":
            return normalized_path.startswith(f"/{stage}/s/")
        return normalized_path.startswith("/s/")
    except Exception as exc:
        logger.error(f"is_existing_short_url failed: {exc}")
        return False

# This function formats the link record into the response sent to the frontend.
def format_link_response(event, item):
    active_until = item.get("activeUntil", item["expiresAt"])
    return {
        "shortUrl": build_short_url(event, item["code"]),
        "code": item["code"],
        "title": item.get("title", ""),
        "longUrl": item["longUrl"],
        "expiryDays": item.get("expiryDays", 0),
        "expiresAt": active_until,
        "purgeAt": item.get("expiresAt", 0),
        "createdAt": item["createdAt"],
        "isCustom": item["isCustom"],
    }

# This function updates the saved title when the same link already exists.
def maybe_update_existing_title(code, existing_item, title):
    # This condition skips the write when the title is empty or unchanged.
    if not title or existing_item.get("title") == title:
        return existing_item

    # This write saves the latest title on an existing link record.
    links_table.update_item(
        Key={"code": code},
        UpdateExpression="SET title = :title",
        ExpressionAttributeValues={":title": title},
    )
    existing_item["title"] = title
    return existing_item

# This function looks for an existing saved URL for the current user.
def find_existing_link_for_user(user_id, long_url):
    items = []
    kwargs = {
        "IndexName": "userId-index",
        "KeyConditionExpression": Key("userId").eq(user_id),
    }
    while True:
        # This read fetches the current user's saved links from the owner index.
        result = links_table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        # This condition stops when there are no more pages in the query result.
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    for item in items:
        # This condition finds the first saved record that matches the same destination URL.
        if item.get("longUrl") == long_url:
            return item
    return None


# This function finds a unique generated code or reuses the user's existing one.
def resolve_generated_code(long_url, user_id):
    base_code = generate_short_code(long_url)
    candidate = base_code
    hash_value = hashlib.md5(long_url.encode("utf-8")).hexdigest()
    offset = 8

    while True:
        # This read checks whether the generated short code already exists in DynamoDB.
        existing = links_table.get_item(Key={"code": candidate}).get("Item")
        # This condition returns a free code when no record is using it yet.
        if not existing:
            return candidate, None
        # This condition reuses the saved record when the same user already owns this URL.
        if existing.get("longUrl") == long_url and existing.get("userId") == user_id:
            return candidate, existing

        next_chunk = hash_value[offset : offset + 2] or hash_value[:2]
        suffix = BASE62_CHARS[int(next_chunk, 16) % len(BASE62_CHARS)]
        candidate = f"{base_code[:7]}{suffix}"
        offset += 2

# This function validates the request and saves a new short link.
def lambda_handler(event, context):
    try:
        # This condition returns early for browser preflight requests.
        if event.get("httpMethod") == "OPTIONS":
            return response(200, {"message": "OK"})

        token_payload = verify_token(event)
        # This condition blocks unauthenticated users from creating links.
        if token_payload is None:
            return unauthorized()

        payload = parse_body(event)
        long_url = normalize_long_url(str(payload.get("longUrl", "")).strip())
        custom_code = str(payload.get("customCode", "")).strip()
        title = str(payload.get("title", "")).strip()
        expiry_days = payload.get("expiryDays", 7)

        # This condition requires a long URL before saving anything.
        if not long_url:
            return response(400, {"error": "longUrl is required"})
        # This condition rejects invalid destination URLs.
        if not is_valid_long_url(long_url):
            return response(400, {"error": "Please enter a valid URL, for example example.com/page or https://example.com/page"})
        # This condition blocks users from shortening an already-shortened LinkVault URL.
        if is_existing_short_url(event, long_url):
            return response(400, {"error": "This is already a LinkVault short URL. Please use the original destination URL instead."})
        # This condition rejects saved titles that are too long.
        if len(title) > TITLE_MAX_LENGTH:
            return response(400, {"error": f"title must be {TITLE_MAX_LENGTH} characters or fewer"})

        existing_link = find_existing_link_for_user(token_payload["userId"], long_url)
        # This condition returns the existing saved link instead of creating a duplicate.
        if existing_link:
            existing_link = maybe_update_existing_title(existing_link["code"], existing_link, title)
            return response(
                200,
                {
                    **format_link_response(event, existing_link),
                    "alreadyExists": True,
                    "message": "This URL is already saved in your links",
                },
            )

        # This condition uses the user-provided custom code when one was supplied.
        if custom_code:
            # This condition rejects custom codes that do not meet the allowed format.
            if not CUSTOM_CODE_RE.match(custom_code):
                return response(400, {"error": "Custom code must be alphanumeric and 3-20 characters"})
            # This read checks whether the requested custom code is already taken.
            existing = links_table.get_item(Key={"code": custom_code}).get("Item")
            # This condition blocks users from taking a custom code that already exists.
            if existing:
                return response(409, {"error": "Custom code already taken"})
            code = custom_code
            is_custom = True
            existing_item = None
        else:
            code, existing_item = resolve_generated_code(long_url, token_payload["userId"])
            is_custom = False

        # This condition returns the existing item when the generated code already belongs to this user.
        if existing_item:
            existing_item = maybe_update_existing_title(code, existing_item, title)
            return response(200, format_link_response(event, existing_item))

        requested_expiry_days = int(expiry_days) if expiry_days not in (None, "", False) else 0
        # This condition prevents negative expiry values from being saved.
        if requested_expiry_days < 0:
            requested_expiry_days = 0

        for _ in range(3):
            created_at = datetime.now(timezone.utc).isoformat()
            active_until = 0 if requested_expiry_days == 0 else int(time.time()) + (requested_expiry_days * 86400)
            expires_at = 0 if requested_expiry_days == 0 else active_until + (RESTORE_GRACE_DAYS * 86400)

            item = {
                "code": code,
                "title": title,
                "longUrl": long_url,
                "userId": token_payload["userId"],
                "userEmail": token_payload["email"],
                "createdAt": created_at,
                "expiryDays": requested_expiry_days,
                "activeUntil": active_until,
                "expiresAt": expires_at,
                "clickCount": 0,
                "isCustom": is_custom,
            }

            try:
                # This write saves the new short link only if the code does not already exist.
                links_table.put_item(
                    Item=item,
                    ConditionExpression="attribute_not_exists(#code)",
                    ExpressionAttributeNames={"#code": "code"},
                )
                return response(201, format_link_response(event, item))
            except ClientError as exc:
                error_code = exc.response.get("Error", {}).get("Code")
                # This condition re-raises unexpected DynamoDB write failures.
                if error_code != "ConditionalCheckFailedException":
                    raise

                # This condition returns a conflict if a custom code was claimed by someone else.
                if is_custom:
                    return response(409, {"error": "Custom code already taken"})

                code, existing_item = resolve_generated_code(long_url, token_payload["userId"])
                # This condition returns the saved item when the code race belongs to the same user's URL.
                if existing_item:
                    return response(200, format_link_response(event, existing_item))

        return response(409, {"error": "Unable to generate a unique short code right now"})
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})
    except ValueError as exc:
        logger.error(f"shorten_handler validation error: {exc}")
        return response(400, {"error": str(exc)})
    except Exception as exc:
        logger.error(f"shorten_handler error: {exc}")
        return response(500, {"error": "Failed to shorten URL"})
