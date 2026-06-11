import json
import jwt
import boto3
import os
from datetime import datetime, timedelta, timezone
from src.links_handler.app import lambda_handler

def test_list_links(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "user-123",
        "email": "user@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    # Insert link
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ["LINKS_TABLE"])
    table.put_item(Item={
        "code": "list123",
        "userId": "user-123",
        "longUrl": "https://example.com/test",
        "title": "List Test",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "clickCount": 5
    })
    
    event = {
        "httpMethod": "GET",
        "headers": {"Authorization": f"Bearer {token}"}
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    
    links = json.loads(response["body"])
    assert len(links) == 1
    assert links[0]["code"] == "list123"
    assert links[0]["title"] == "List Test"

def test_rename_link(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "user-123",
        "email": "user@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    # Insert link
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ["LINKS_TABLE"])
    table.put_item(Item={
        "code": "rename123",
        "userId": "user-123",
        "longUrl": "https://example.com/test",
        "title": "Old Title",
        "createdAt": datetime.now(timezone.utc).isoformat()
    })
    
    event = {
        "httpMethod": "PATCH",
        "pathParameters": {"code": "rename123"},
        "headers": {"Authorization": f"Bearer {token}"},
        "body": json.dumps({"title": "New Title"})
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    
    # Verify in DB
    item = table.get_item(Key={"code": "rename123"})["Item"]
    assert item["title"] == "New Title"

def test_delete_link(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "user-123",
        "email": "user@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ["LINKS_TABLE"])
    table.put_item(Item={
        "code": "delete123",
        "userId": "user-123",
        "longUrl": "https://example.com/delete",
        "createdAt": datetime.now(timezone.utc).isoformat()
    })
    
    event = {
        "httpMethod": "DELETE",
        "pathParameters": {"code": "delete123"},
        "headers": {"Authorization": f"Bearer {token}"}
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    
    # Verify deleted
    assert "Item" not in table.get_item(Key={"code": "delete123"})
