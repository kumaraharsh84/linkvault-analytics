import json
import jwt
import boto3
import os
from datetime import datetime, timedelta, timezone
from src.analytics_handler.app import lambda_handler

def test_get_analytics(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "user-123",
        "email": "user@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    dynamodb = boto3.resource("dynamodb")
    links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
    clicks_table = dynamodb.Table(os.environ["CLICKS_TABLE"])
    
    # Insert link
    links_table.put_item(Item={
        "code": "stat123",
        "userId": "user-123",
        "longUrl": "https://example.com/stats",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "clickCount": 2
    })
    
    # Insert clicks
    clicks_table.put_item(Item={
        "clickId": "click-1",
        "code": "stat123",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "device": "Desktop",
        "country": "USA"
    })
    clicks_table.put_item(Item={
        "clickId": "click-2",
        "code": "stat123",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "device": "Mobile",
        "country": "UK"
    })
    
    event = {
        "httpMethod": "GET",
        "pathParameters": {"code": "stat123"},
        "headers": {"Authorization": f"Bearer {token}"}
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    
    body = json.loads(response["body"])
    assert body["code"] == "stat123"
    assert body["totalClicks"] == 2
    assert len(body["clicks"]) == 2
    assert body["byDevice"]["Desktop"] == 1
    assert body["byDevice"]["Mobile"] == 1

def test_analytics_forbidden(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "wrong-user",
        "email": "wrong@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    dynamodb = boto3.resource("dynamodb")
    links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
    links_table.put_item(Item={
        "code": "stat123",
        "userId": "user-123",
        "longUrl": "https://example.com/stats",
        "createdAt": datetime.now(timezone.utc).isoformat()
    })
    
    event = {
        "httpMethod": "GET",
        "pathParameters": {"code": "stat123"},
        "headers": {"Authorization": f"Bearer {token}"}
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 403
    assert "You do not own this link" in json.loads(response["body"])["error"]
