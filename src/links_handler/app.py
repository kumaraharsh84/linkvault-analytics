# This file manages the saved links list for each user.
# It loads links, renames titles, restores expired links, and deletes data.
# It also cleans up click records when a link is removed.
import json
import logging
import os
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)
from datetime import datetime
from decimal import Decimal

import boto3
import jwt
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
clicks_table = dynamodb.Table(os.environ["CLICKS_TABLE"])
JWT_SECRET = os.environ["JWT_SECRET"]
TITLE_MAX_LENGTH = 80
RESTORE_GRACE_DAYS = 7

# This function returns the CORS headers used by every links response.
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

# This function converts DynamoDB decimal values into normal JSON numbers.
def json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Type not serializable: {type(value)}")

# This function builds a JSON API response with CORS headers.
def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": cors_headers(),
        "body": json.dumps(body, default=json_default),
    }

# This function parses the incoming JSON request body.
def parse_body(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raise ValueError("Base64 encoded payloads are not supported")
    return json.loads(body)

# This function reshapes a link item for the frontend response format.
def normalize_link_item(item):
    normalized = dict(item)
    active_until = int(normalized.get("activeUntil") or normalized.get("expiresAt") or 0)
    purge_at = int(normalized.get("expiresAt") or 0)
    normalized["expiresAt"] = active_until
    normalized["purgeAt"] = purge_at
    normalized["expiryDays"] = infer_expiry_days(item)
    return normalized

# This function fetches every click row for one short code.
def query_all_clicks(code):
    items = []
    kwargs = {
        "IndexName": "code-index",
        "KeyConditionExpression": Key("code").eq(code),
    }
    while True:
        # This read fetches click rows for the short code from the DynamoDB index.
        result = clicks_table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        # This condition stops when the click query has no more pages.
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items

# This function fetches every saved link for one user.
def query_all_links_for_user(user_id):
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
        # This condition stops when the links query has no more pages.
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items

# This function routes list, rename, restore, and delete requests.
def lambda_handler(event, context):
    try:
        # This condition returns early for browser preflight requests.
        if event.get("httpMethod") == "OPTIONS":
            return response(200, {"message": "OK"})

        token_payload = verify_token(event)
        # This condition blocks link management when the token is missing or invalid.
        if token_payload is None:
            return unauthorized()

        method = event.get("httpMethod")
        # This condition routes link listing requests.
        if method == "GET":
            return list_links(token_payload)
        # This condition routes saved title update requests.
        if method == "PATCH":
            return rename_link(token_payload, event)
        # This condition routes restore requests for expired links.
        if method == "POST":
            return restore_link(token_payload, event)
        # This condition routes link deletion requests.
        if method == "DELETE":
            return delete_link(token_payload, event)
        return response(404, {"error": "Route not found"})
    except ValueError as exc:
        logger.error(f"links_handler validation error: {exc}")
        return response(400, {"error": str(exc)})
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})
    except Exception as exc:
        logger.error(f"links_handler error: {exc}")
        return response(500, {"error": "Internal server error"})

# This function returns the user's saved links in newest-first order.
def list_links(token_payload):
    try:
        # Query the owner index and then sort in memory for newest-first display.
        items = query_all_links_for_user(token_payload["userId"])
        items.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
        return response(200, [normalize_link_item(item) for item in items])
    except Exception as exc:
        logger.error(f"list_links error: {exc}")
        return response(500, {"error": "Failed to load links"})

# This function deletes one saved link and all of its click records.
def delete_link(token_payload, event):
    try:
        code = (event.get("pathParameters") or {}).get("code")
        # This condition stops the request when the short code is missing.
        if not code:
            return response(400, {"error": "Short code is required"})

        # This read fetches the saved link before ownership is checked.
        item = links_table.get_item(Key={"code": code}).get("Item")
        # This condition returns not found when the link does not exist.
        if not item:
            return response(404, {"error": "Link not found"})
        # This condition blocks deletion for links owned by another user.
        if item["userId"] != token_payload["userId"]:
            return response(403, {"error": "You do not own this link"})

        # This write deletes the saved link record from DynamoDB.
        links_table.delete_item(Key={"code": code})

        clicks = query_all_clicks(code)
        with clicks_table.batch_writer() as batch:
            for click in clicks:
                # This write deletes each stored click row for the removed link.
                batch.delete_item(Key={"clickId": click["clickId"]})

        return response(200, {"message": "Link deleted successfully"})
    except Exception as exc:
        logger.error(f"delete_link error: {exc}")
        return response(500, {"error": "Failed to delete link"})

# This function updates the saved title for an existing link.
def rename_link(token_payload, event):
    try:
        code = (event.get("pathParameters") or {}).get("code")
        # This condition stops the request when the short code is missing.
        if not code:
            return response(400, {"error": "Short code is required"})

        payload = parse_body(event)
        title = str(payload.get("title", "")).strip()
        # This condition requires a non-empty saved title.
        if not title:
            return response(400, {"error": "title is required"})
        # This condition rejects titles that are too long.
        if len(title) > TITLE_MAX_LENGTH:
            return response(400, {"error": f"title must be {TITLE_MAX_LENGTH} characters or fewer"})

        # This read fetches the link before checking ownership and updating it.
        item = links_table.get_item(Key={"code": code}).get("Item")
        # This condition returns not found when the link does not exist.
        if not item:
            return response(404, {"error": "Link not found"})
        # This condition blocks renaming for links owned by another user.
        if item["userId"] != token_payload["userId"]:
            return response(403, {"error": "You do not own this link"})

        # This write saves the new personal title on the link record.
        links_table.update_item(
            Key={"code": code},
            UpdateExpression="SET title = :title",
            ExpressionAttributeValues={":title": title},
        )
        item["title"] = title
        return response(200, {"message": "Link renamed successfully", "link": normalize_link_item(item)})
    except Exception as exc:
        logger.error(f"rename_link error: {exc}")
        return response(500, {"error": "Failed to rename link"})

# This function figures out how many days the link was meant to stay active.
def infer_expiry_days(item):
    stored = item.get("expiryDays")
    # This condition prefers the stored expiry setting when it already exists.
    if stored not in (None, ""):
        try:
            return max(0, int(stored))
        except (TypeError, ValueError):
            pass

    active_until = int(item.get("activeUntil") or item.get("expiresAt") or 0)
    # This condition marks never-expiring links with zero days.
    if active_until == 0:
        return 0

    created_at = item.get("createdAt")
    # This condition falls back to seven days when the original time is missing.
    if not created_at:
        return 7

    try:
        created_seconds = int(datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp())
        diff_seconds = max(0, active_until - created_seconds)
        return max(1, round(diff_seconds / 86400))
    except Exception as exc:
        logger.error(f"infer_expiry_days failed: {exc}")
        return 7

# This function restores an expired link while its grace window is still open.
def restore_link(token_payload, event):
    try:
        code = (event.get("pathParameters") or {}).get("code")
        # This condition stops the request when the short code is missing.
        if not code:
            return response(400, {"error": "Short code is required"})

        # This read fetches the saved link before restore checks are made.
        item = links_table.get_item(Key={"code": code}).get("Item")
        # This condition returns not found when the link does not exist.
        if not item:
            return response(404, {"error": "Link not found"})
        # This condition blocks restore for links owned by another user.
        if item["userId"] != token_payload["userId"]:
            return response(403, {"error": "You do not own this link"})

        active_until = int(item.get("activeUntil") or item.get("expiresAt") or 0)
        # This condition skips restore for links that were set to never expire.
        if active_until == 0:
            return response(400, {"error": "This link never expires and does not need restoring"})

        now = int(time.time())
        # This condition blocks restore when the link is still active.
        if active_until > now:
            return response(400, {"error": "This link is still active"})

        purge_at = int(item.get("expiresAt") or (active_until + (RESTORE_GRACE_DAYS * 86400)))
        # This condition blocks restore when the extra grace period is already over.
        if purge_at <= now:
            return response(410, {"error": "The restore window has ended for this link"})

        expiry_days = infer_expiry_days(item)
        # This condition blocks restore when the original expiry length cannot be reused.
        if expiry_days <= 0:
            return response(400, {"error": "This link cannot be restored automatically"})

        new_active_until = now + (expiry_days * 86400)
        new_purge_at = new_active_until + (RESTORE_GRACE_DAYS * 86400)

        # This write stores the new active time and the new cleanup time for the restored link.
        links_table.update_item(
            Key={"code": code},
            UpdateExpression="SET activeUntil = :activeUntil, expiresAt = :expiresAt, expiryDays = :expiryDays",
            ExpressionAttributeValues={
                ":activeUntil": new_active_until,
                ":expiresAt": new_purge_at,
                ":expiryDays": expiry_days,
            },
        )

        item["activeUntil"] = new_active_until
        item["expiresAt"] = new_purge_at
        item["expiryDays"] = expiry_days
        return response(200, {"message": "Link restored successfully", "link": normalize_link_item(item)})
    except Exception as exc:
        logger.error(f"restore_link error: {exc}")
        return response(500, {"error": "Failed to restore link"})
