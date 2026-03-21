# This file handles public redirects for short links.
# It checks expiry, records click details, and sends visitors to the long URL.
# It also calls the geo service to enrich click analytics data.
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import boto3
import jwt
from boto3.dynamodb.types import TypeSerializer


dynamodb = boto3.resource("dynamodb")
ddb_client = boto3.client("dynamodb")
links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
clicks_table = dynamodb.Table(os.environ["CLICKS_TABLE"])
JWT_SECRET = os.environ["JWT_SECRET"]
serializer = TypeSerializer()

# This function returns the CORS headers used by every redirect response.
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
        print(f"verify_token failed: {exc}")
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

# This function detects the device type from the user agent string.
def detect_device(user_agent):
    # This condition marks tablets before checking for mobile devices.
    if "Tablet" in user_agent:
        return "Tablet"
    # This condition marks mobile devices from the user agent.
    if "Mobile" in user_agent:
        return "Mobile"
    return "Desktop"


# This function converts Python values into DynamoDB transaction values.
def serialize_item(item):
    return {key: serializer.serialize(value) for key, value in item.items()}

# This function converts latitude and longitude into DynamoDB decimals.
def decimal_number(value):
    return Decimal(str(value))

# This function fetches geo data for the source IP from ip-api.com.
def geo_lookup(ip_address):
    geo_url = (
        f"http://ip-api.com/json/{ip_address}"
        "?fields=country,city,regionName,isp,lat,lon"
    )
    try:
        # This external API call gets country and city details for the click IP address.
        with urllib.request.urlopen(geo_url, timeout=3) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as exc:
        print(f"geo lookup failed for {ip_address}: {exc}")
        return {
            "country": "Unknown",
            "city": "Unknown",
            "regionName": "Unknown",
            "isp": "Unknown",
            "lat": 0,
            "lon": 0,
        }

# This function loads a short link, records the click, and returns a redirect.
def lambda_handler(event, context):
    print(f"redirect_handler event: {json.dumps(event)}")
    try:
        # This condition returns early for browser preflight requests.
        if event.get("httpMethod") == "OPTIONS":
            return response(200, {"message": "OK"})

        code = (event.get("pathParameters") or {}).get("code")
        # This condition stops the request when the short code is missing.
        if not code:
            return response(400, {"error": "Short code is required"})

        # This read fetches the saved link record for the requested short code.
        item = links_table.get_item(Key={"code": code}).get("Item")
        # This condition returns not found when the short code does not exist.
        if not item:
            return response(404, {"error": "Short link not found"})

        active_until = int(item.get("activeUntil") or item.get("expiresAt") or 0)
        # This condition blocks redirects when the link is already expired.
        if active_until and int(time.time()) > active_until:
            return response(410, {"error": "This short link has expired"})

        # Increment the counter first so the link summary stays in sync with click logs.
        headers = event.get("headers") or {}
        request_context = event.get("requestContext") or {}
        identity = request_context.get("identity") or {}
        http_context = request_context.get("http") or {}

        user_agent = headers.get("User-Agent") or headers.get("user-agent") or "Unknown"
        ip_address = (
            identity.get("sourceIp")
            or http_context.get("sourceIp")
            or headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or "Unknown"
        )
        timestamp = datetime.now(timezone.utc).isoformat()
        device = detect_device(user_agent)

        # This external API call is optional so redirect still works if geo lookup fails.
        geo = geo_lookup(ip_address)

        click_item = {
            "clickId": str(uuid4()),
            "code": code,
            "timestamp": timestamp,
            "userAgent": user_agent,
            "ip": ip_address,
            "device": device,
            "country": geo["country"],
            "city": geo["city"],
            "region": geo["regionName"],
            "isp": geo["isp"],
            "lat": decimal_number(geo["lat"]),
            "lon": decimal_number(geo["lon"]),
        }
        
        # This write saves the click event to DynamoDB.
        clicks_table.put_item(Item=serialize_item(click_item))

        # This write updates the link click count and saves the click row in one DynamoDB transaction.
        ddb_client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": os.environ["LINKS_TABLE"],
                        "Key": serialize_item({"code": code}),
                        "UpdateExpression": "ADD clickCount :inc",
                        "ExpressionAttributeValues": {":inc": {"N": "1"}},
                        "ConditionExpression": "attribute_exists(code)",
                    }
                },
                {
                    "Put": {
                        "TableName": os.environ["CLICKS_TABLE"],
                        "Item": serialize_item(click_item),
                        "ConditionExpression": "attribute_not_exists(clickId)",
                    }
                },
            ]
        )

        # This response redirects the user to the long URL.
        return {
            "statusCode": 301,
            "headers": {
                **cors_headers(),
                "Location": item["longUrl"],
                "Cache-Control": "private, max-age=90",
                **cors_headers()
            },
            "body": "",
        }
    except Exception as exc:
        print(f"redirect_handler error: {exc}")
        return response(500, {"error": "Failed to process redirect"})
        return response(500, {"error": "Internal server error"})
