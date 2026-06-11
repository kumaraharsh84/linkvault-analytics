import os
import boto3
import pytest
from moto import mock_aws

# Set these globally so imports during collection don't fail
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["LINKS_TABLE"] = "linkvault-links-test"
os.environ["CLICKS_TABLE"] = "linkvault-clicks-test"
os.environ["USERS_TABLE"] = "linkvault-users-test"
os.environ["JWT_SECRET"] = "super-secret-test-key"

@pytest.fixture
def mock_aws_env():
    # just an empty fixture for compatibility with test signatures
    pass

@pytest.fixture
def dynamodb_tables():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
        dynamodb.create_table(
            TableName=os.environ["LINKS_TABLE"],
            KeySchema=[{"AttributeName": "code", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "code", "AttributeType": "S"},
                {"AttributeName": "userId", "AttributeType": "S"}
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "userId-index",
                    "KeySchema": [{"AttributeName": "userId", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"}
                }
            ],
            BillingMode="PAY_PER_REQUEST"
        )
        
        dynamodb.create_table(
            TableName=os.environ["CLICKS_TABLE"],
            KeySchema=[{"AttributeName": "clickId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "clickId", "AttributeType": "S"},
                {"AttributeName": "code", "AttributeType": "S"}
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "code-index",
                    "KeySchema": [{"AttributeName": "code", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"}
                }
            ],
            BillingMode="PAY_PER_REQUEST"
        )

        dynamodb.create_table(
            TableName=os.environ["USERS_TABLE"],
            KeySchema=[{"AttributeName": "userId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "email", "AttributeType": "S"}
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "email-index",
                    "KeySchema": [{"AttributeName": "email", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"}
                }
            ],
            BillingMode="PAY_PER_REQUEST"
        )
        
        yield dynamodb
