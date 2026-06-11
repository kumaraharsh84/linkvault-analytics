import json
from unittest.mock import patch
from src.auth_handler.app import lambda_handler

def test_register_and_login_success(mock_aws_env, dynamodb_tables):
    # 1. Register a new user
    register_event = {
        "httpMethod": "POST",
        "resource": "/auth/register",
        "body": json.dumps({
            "name": "Test User",
            "email": "test@example.com",
            "password": "Password123!"
        })
    }
    
    reg_response = lambda_handler(register_event, None)
    assert reg_response["statusCode"] == 201
    assert "Account created successfully" in json.loads(reg_response["body"])["message"]
    
    # 2. Login with the new user
    login_event = {
        "httpMethod": "POST",
        "resource": "/auth/login",
        "body": json.dumps({
            "email": "test@example.com",
            "password": "Password123!"
        })
    }
    
    login_response = lambda_handler(login_event, None)
    assert login_response["statusCode"] == 200
    
    body = json.loads(login_response["body"])
    assert "token" in body
    assert body["name"] == "Test User"
    assert body["email"] == "test@example.com"

def test_register_duplicate_email(mock_aws_env, dynamodb_tables):
    # Register first user
    event = {
        "httpMethod": "POST",
        "resource": "/auth/register",
        "body": json.dumps({
            "name": "User One",
            "email": "duplicate@example.com",
            "password": "pass"
        })
    }
    lambda_handler(event, None)
    
    # Try to register again
    event["body"] = json.dumps({
        "name": "User Two",
        "email": "duplicate@example.com",
        "password": "pass"
    })
    response = lambda_handler(event, None)
    assert response["statusCode"] == 409
    assert "Email already registered" in json.loads(response["body"])["error"]

def test_login_wrong_password(mock_aws_env, dynamodb_tables):
    # Register user
    event = {
        "httpMethod": "POST",
        "resource": "/auth/register",
        "body": json.dumps({
            "name": "User",
            "email": "wrongpass@example.com",
            "password": "correct_password"
        })
    }
    lambda_handler(event, None)
    
    # Login with wrong password
    login_event = {
        "httpMethod": "POST",
        "resource": "/auth/login",
        "body": json.dumps({
            "email": "wrongpass@example.com",
            "password": "wrong_password"
        })
    }
    
    response = lambda_handler(login_event, None)
    assert response["statusCode"] == 401
    assert "Incorrect password" in json.loads(response["body"])["error"]
