import json
import os
from unittest.mock import patch
from src.redirect_handler.app import lambda_handler

def test_redirect_handler_success(mock_aws_env, dynamodb_tables):
    # Setup mock data
    dynamodb = __import__("boto3").resource("dynamodb")
    links_table = dynamodb.Table(os.environ["LINKS_TABLE"])
    links_table.put_item(Item={
        "code": "test1234",
        "longUrl": "https://example.com",
        "clickCount": 0
    })
    
    event = {
        "httpMethod": "GET",
        "pathParameters": {"code": "test1234"},
        "headers": {"User-Agent": "Mozilla/5.0"},
        "requestContext": {"identity": {"sourceIp": "8.8.8.8"}}
    }
    
    with patch("src.redirect_handler.app.geo_lookup") as mock_geo:
        mock_geo.return_value = {
            "country": "US", "city": "Mountain View", "regionName": "CA",
            "isp": "Google", "lat": 37.386, "lon": -122.083
        }
        response = lambda_handler(event, None)
        
    assert response["statusCode"] == 301
    assert response["headers"]["Location"] == "https://example.com"
    
    # Verify click count was incremented
    updated_link = links_table.get_item(Key={"code": "test1234"})["Item"]
    assert updated_link["clickCount"] == 1
    
    # Verify click was recorded
    clicks_table = dynamodb.Table(os.environ["CLICKS_TABLE"])
    clicks = clicks_table.scan()["Items"]
    assert len(clicks) == 1
    assert clicks[0]["code"] == "test1234"
