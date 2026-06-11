import json
import jwt
from datetime import datetime, timedelta
from src.shorten_handler.app import lambda_handler, generate_short_code, is_valid_long_url

def test_generate_short_code():
    url = "https://example.com/very/long/path"
    code1 = generate_short_code(url)
    code2 = generate_short_code(url)
    assert code1 == code2
    assert len(code1) == 8
    assert code1.isalnum()

def test_is_valid_long_url():
    assert is_valid_long_url("https://example.com") is True
    assert is_valid_long_url("http://example.com/path") is True
    assert is_valid_long_url("https://localhost:8080") is True
    assert is_valid_long_url("ftp://example.com") is False
    assert is_valid_long_url("invalid-url") is False

def test_shorten_url(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "user-123",
        "email": "user@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    event = {
        "headers": {"Authorization": f"Bearer {token}", "Host": "api.example.com"},
        "body": json.dumps({
            "longUrl": "https://example.com/test",
            "title": "Test Title",
            "expiryDays": 7
        })
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 201
    
    body = json.loads(response["body"])
    assert "shortUrl" in body
    assert body["code"]
    assert body["longUrl"] == "https://example.com/test"
    assert body["title"] == "Test Title"
    
def test_shorten_url_custom_code(mock_aws_env, dynamodb_tables):
    token = jwt.encode({
        "userId": "user-123",
        "email": "user@example.com",
        "exp": datetime.utcnow() + timedelta(hours=1)
    }, "super-secret-test-key", algorithm="HS256")
    
    event = {
        "headers": {"Authorization": f"Bearer {token}", "Host": "api.example.com"},
        "body": json.dumps({
            "longUrl": "https://example.com/custom",
            "customCode": "myCode123"
        })
    }
    
    response = lambda_handler(event, None)
    assert response["statusCode"] == 201
    
    body = json.loads(response["body"])
    assert body["code"] == "myCode123"
    assert body["isCustom"] is True
    
def test_shorten_unauthorized(mock_aws_env, dynamodb_tables):
    event = {
        "headers": {},
        "body": json.dumps({"longUrl": "https://example.com"})
    }
    response = lambda_handler(event, None)
    assert response["statusCode"] == 401
