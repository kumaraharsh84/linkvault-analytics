# This file handles account registration and login for the API.
# It validates user input, stores users in DynamoDB, and returns JWT tokens.
# It also returns CORS-safe responses for auth routes.
import json
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import bcrypt
import boto3
import jwt
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError


dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE"])
ddb_client = boto3.client("dynamodb")
JWT_SECRET = os.environ["JWT_SECRET"]
serializer = TypeSerializer()

# This function returns the CORS headers used by every auth response.
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

# This function parses the incoming JSON request body.
def parse_body(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raise ValueError("Base64 encoded payloads are not supported")
    return json.loads(body)

# This function converts Python values into DynamoDB transaction values.
def serialize_item(item):
    return {key: serializer.serialize(value) for key, value in item.items()}

# This function builds the internal lock key used to reserve an email.
def email_lock_key(email):
    return f"EMAIL#{email}"

# This function routes the request to register or login.
def lambda_handler(event, context):
    print(f"auth_handler event: {json.dumps(event)}")
    try:
        method = event.get("httpMethod", "")
        path = event.get("resource") or event.get("path", "")

        # This condition returns early for browser preflight requests.
        if method == "OPTIONS":
            return response(200, {"message": "OK"})

        # This condition sends registration requests to the register handler.
        if method == "POST" and path.endswith("/auth/register"):
            return register(event)
        # This condition sends login requests to the login handler.
        if method == "POST" and path.endswith("/auth/login"):
            return login(event)

        return response(404, {"error": "Route not found"})
    except Exception as exc:
        print(f"auth_handler error: {exc}")
        return response(500, {"error": "Internal server error"})

# This function creates a new user account and reserves the email.
def register(event):
    try:
        # Validate the incoming registration payload before touching DynamoDB.
        payload = parse_body(event)
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))

        # This condition stops the request if any required field is missing.
        if not name or not email or not password:
            return response(400, {"error": "Name, email, and password are required"})

        # Store only the bcrypt hash, never the raw password.
        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        created_at = datetime.now(timezone.utc).isoformat()
        user_item = {
            "userId": str(uuid4()),
            "itemType": "USER",
            "name": name,
            "email": email,
            "password": hashed,
            "createdAt": created_at,
        }
        lock_item = {
            "userId": email_lock_key(email),
            "itemType": "EMAIL_LOCK",
            "createdAt": created_at,
        }

        try:
            # Reserve the email and create the user atomically to block duplicate registrations.
            # This write saves the email lock and the new user in one DynamoDB transaction.
            ddb_client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": os.environ["USERS_TABLE"],
                            "Item": serialize_item(lock_item),
                            "ConditionExpression": "attribute_not_exists(userId)",
                        }
                    },
                    {
                        "Put": {
                            "TableName": os.environ["USERS_TABLE"],
                            "Item": serialize_item(user_item),
                            "ConditionExpression": "attribute_not_exists(userId)",
                        }
                    },
                ]
            )
        except ClientError as exc:
            # This condition returns a conflict when the email is already reserved.
            if exc.response.get("Error", {}).get("Code") == "TransactionCanceledException":
                return response(409, {"error": "Email already registered"})
            raise

        return response(201, {"message": "Account created successfully"})
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})
    except Exception as exc:
        print(f"register error: {exc}")
        return response(500, {"error": "Failed to register account"})

# This function validates login details and returns a signed JWT token.
def login(event):
    try:
        payload = parse_body(event)
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))

        # This condition stops the request if email or password is missing.
        if not email or not password:
            return response(400, {"error": "Email and password are required"})

        # This read looks up the user by email from the DynamoDB email index.
        result = users_table.query(
            IndexName="email-index",
            KeyConditionExpression=Key("email").eq(email),
        )
        items = result.get("Items", [])
        # This condition returns not found when no user exists for the email.
        if not items:
            return response(404, {"error": "No account found with this email"})

        user = next((item for item in items if item.get("itemType", "USER") == "USER"), None)
        # This condition skips non-user helper records like email locks.
        if user is None:
            return response(404, {"error": "No account found with this email"})

        # This condition blocks login when the password does not match the saved hash.
        if not bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8")):
            return response(401, {"error": "Incorrect password"})

        # JWT carries the user identity needed by all protected handlers.
        token_payload = {
            "userId": user["userId"],
            "email": user["email"],
            "name": user["name"],
            "exp": datetime.utcnow() + timedelta(hours=24),
        }
        token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")

        return response(
            200,
            {
                "token": token,
                "name": user["name"],
                "email": user["email"],
                "userId": user["userId"],
            },
        )
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})
    except Exception as exc:
        print(f"login error: {exc}")
        return response(500, {"error": "Failed to login"})
