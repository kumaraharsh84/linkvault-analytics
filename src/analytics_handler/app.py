# This file returns analytics data for a saved short link.
# It checks ownership, reads click rows, and builds chart-friendly summaries.
# It also keeps the responses safe for browser access with CORS headers.
import json
import logging
import os
from collections import Counter

logger = logging.getLogger()
logger.setLevel(logging.INFO)
from decimal import Decimal

import boto3
import jwt
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
clicks_table = dynamodb.Table(os.environ["CLICKS_TABLE"])
JWT_SECRET = os.environ["JWT_SECRET"]

# This function returns the CORS headers used by every analytics response.
def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
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

# This function fetches every click row for one short code.
def query_all_clicks(code):
    items = []
    kwargs = {
        "IndexName": "code-index",
        "KeyConditionExpression": Key("code").eq(code),
    }
    while True:
        # This read fetches click records for the short code from the DynamoDB index.
        result = clicks_table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        # This condition stops when the click query has no more pages.
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items

# This function validates ownership and returns analytics for one link.
def lambda_handler(event, context):
    try:
        # This condition returns early for browser preflight requests.
        if event.get("httpMethod") == "OPTIONS":
            return response(200, {"message": "OK"})

        token_payload = verify_token(event)
        # This condition blocks analytics access when the token is missing or invalid.
        if token_payload is None:
            return unauthorized()

        code = (event.get("pathParameters") or {}).get("code")
        # This condition stops the request when the short code is missing.
        if not code:
            return response(400, {"error": "Short code is required"})

        # This read fetches the saved link so ownership can be checked first.
        item = links_table.get_item(Key={"code": code}).get("Item")
        # This condition returns not found when the link does not exist.
        if not item:
            return response(404, {"error": "Link not found"})
        # This condition blocks analytics access for links owned by another user.
        if item["userId"] != token_payload["userId"]:
            return response(403, {"error": "You do not own this link"})

        clicks = sorted(query_all_clicks(code), key=lambda click: click.get("timestamp", ""), reverse=True)
        logger.info(f"Found {len(clicks)} clicks for code {code}")
        # Pre-aggregate analytics server-side so the frontend can render charts directly.
        by_device = Counter(click.get("device", "Unknown") for click in clicks)
        by_country = Counter(click.get("country", "Unknown") for click in clicks)
        by_date = Counter(click.get("timestamp", "")[:10] for click in clicks if click.get("timestamp"))

        return response(
            200,
            {
                "code": item["code"],
                "longUrl": item["longUrl"],
                "createdAt": item["createdAt"],
                "totalClicks": item.get("clickCount", len(clicks)),
                "clicks": clicks,
                "byDevice": dict(by_device),
                "byCountry": dict(by_country),
                "byDate": dict(sorted(by_date.items())),
            },
        )
    except Exception as exc:
        logger.error(f"analytics_handler error: {exc}")
        return response(500, {"error": "Failed to load analytics"})
