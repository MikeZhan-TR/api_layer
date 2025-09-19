#! /usr/bin/env python3

import json
from datetime import datetime, timedelta, date
import uuid
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError
import os
import jwt
import logging
from functools import wraps
import pytz
import requests
import time
import snowflake.connector
import traceback

# Print configuration
ENABLE_ALL_PRINTS = False  # Set to True to enable all prints regardless of function settings

PRINT_ENABLED_FUNCTIONS = {

    'snowflake_health': True,
    'snowflake_opportunities': True,
    'snowflake_budget': True,
}

def control_output(func):
    """Decorator to selectively enable printing and logging for specific functions."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Store the original print function and logger level
        original_print = print
        original_level = logger.getEffectiveLevel()
        
        # Define a no-op print function
        def no_op_print(*args, **kwargs):
            pass
        
        # Determine if we should enable output for this function
        should_output = ENABLE_ALL_PRINTS or PRINT_ENABLED_FUNCTIONS.get(func.__name__, False)
        
        # Replace the global print function and adjust logger level if output is disabled
        if not should_output:
            globals()['print'] = no_op_print
            logger.setLevel(logging.ERROR)  # Only show ERROR level logs when output is disabled
        
        try:
            # Execute the function
            result = func(*args, **kwargs)
            return result
        finally:
            # Restore the original print function and logger level
            globals()['print'] = original_print
            logger.setLevel(original_level)
    
    return wrapper

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# # print("Lambda cold start - initializing...")

# Custom JSON encoder to handle Decimal and datetime types
class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder for Decimal, datetime, and date types."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return super(DecimalEncoder, self).default(obj)

# Cache for Cognito public keys
_COGNITO_PUBLIC_KEYS = {}
_COGNITO_KEYS_TIMESTAMP = 0
_COGNITO_KEYS_CACHE_DURATION = 24 * 60 * 60  # 24 hours in seconds

def _get_cognito_public_keys():
    """Fetch and cache Cognito public keys used for JWT verification."""
    global _COGNITO_PUBLIC_KEYS, _COGNITO_KEYS_TIMESTAMP
    
    current_time = time.time()
    
    # Return cached keys if they're still valid
    if _COGNITO_PUBLIC_KEYS and current_time - _COGNITO_KEYS_TIMESTAMP < _COGNITO_KEYS_CACHE_DURATION:
        return _COGNITO_PUBLIC_KEYS
    
    try:
        # Get the Cognito user pool region and id from environment variables
        region = os.environ.get('COGNITO_REGION', 'us-east-1')
        user_pool_id = os.environ.get('COGNITO_USER_POOL_ID')
        
        if not user_pool_id:
            logger.error("COGNITO_USER_POOL_ID environment variable is not set")
            return {}
        
        # Fetch the public keys from Cognito
        keys_url = f'https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json'
        response = requests.get(keys_url)
        response.raise_for_status()
        
        # Process and cache the keys
        keys = response.json()['keys']
        _COGNITO_PUBLIC_KEYS = {key['kid']: key for key in keys}
        _COGNITO_KEYS_TIMESTAMP = current_time
        
        return _COGNITO_PUBLIC_KEYS
    
    except Exception as e:
        logger.error(f"Error fetching Cognito public keys: {str(e)}")
        return {}

def _authenticate(event):
    """Authenticate the incoming request by verifying the JWT token."""
    try:
        token = event['headers'].get('Authorization')
        if not token:
            logger.error("Missing Authorization token in headers")
            return None, {
                'statusCode': 401,
                'body': json.dumps({"error": "No token provided"})
            }
        
        logger.debug("Found Authorization token in headers")
        
        try:
            # Split the Bearer token
            token_parts = token.split()
            if len(token_parts) != 2 or token_parts[0].lower() != 'bearer':
                logger.error("Invalid token format")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Invalid token format"})
                }
            
            # Get the actual JWT token
            jwt_token = token_parts[1]
            
            # Get the unverified headers to get the key id (kid)
            unverified_headers = jwt.get_unverified_header(jwt_token)
            kid = unverified_headers.get('kid')
            
            if not kid:
                logger.error("No 'kid' found in token headers")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Invalid token: no key ID"})
                }
            
            # Get Cognito public keys
            public_keys = _get_cognito_public_keys()
            if not public_keys:
                logger.error("Failed to get Cognito public keys")
                return None, {
                    'statusCode': 500,
                    'body': json.dumps({"error": "Internal server error"})
                }
            
            # Get the public key that matches the kid
            public_key = public_keys.get(kid)
            if not public_key:
                logger.error(f"No matching public key found for kid: {kid}")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Invalid token: key not found"})
                }
            
            # Verify and decode the token
            try:
                # Get expected values from environment variables
                region = os.environ.get('COGNITO_REGION', 'us-east-1')
                user_pool_id = os.environ.get('COGNITO_USER_POOL_ID')
                client_id = os.environ.get('COGNITO_CLIENT_ID')
                
                if not all([region, user_pool_id, client_id]):
                    logger.error("Missing required Cognito environment variables")
                    return None, {
                        'statusCode': 500,
                        'body': json.dumps({"error": "Internal server error"})
                    }
                
                # Construct the issuer
                issuer = f'https://cognito-idp.{region}.amazonaws.com/{user_pool_id}'
                
                # Decode and verify the token
                decoded = jwt.decode(
                    jwt_token,
                    jwt.algorithms.RSAAlgorithm.from_jwk(public_key),
                    algorithms=['RS256'],
                    options={
                        'verify_signature': True,
                        'verify_exp': True,
                        'verify_iat': True,
                        'verify_aud': True,
                        'verify_iss': True
                    },
                    audience=client_id,
                    issuer=issuer
                )
                
                logger.debug("Successfully verified and decoded JWT token")
                
                cognito_sub = decoded.get('sub')
                if not cognito_sub:
                    logger.error("Missing 'sub' claim in JWT token")
                    return None, {
                        'statusCode': 401,
                        'body': json.dumps({"error": "Invalid token: missing 'sub' claim"})
                    }
                
                logger.debug(f"Authenticated user with Cognito sub: {cognito_sub}")
                return cognito_sub, None
                
            except jwt.ExpiredSignatureError:
                logger.error("Token has expired")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Token has expired"})
                }
            except jwt.InvalidAudienceError:
                logger.error("Token has invalid audience")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Token has invalid audience"})
                }
            except jwt.InvalidIssuerError:
                logger.error("Token has invalid issuer")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Token has invalid issuer"})
                }
            except Exception as e:
                logger.error(f"Error verifying token: {str(e)}")
                return None, {
                    'statusCode': 401,
                    'body': json.dumps({"error": "Invalid token"})
                }
            
        except Exception as e:
            logger.error(f"Token processing error: {str(e)}")
            return None, {
                'statusCode': 401,
                'body': json.dumps({"error": "Invalid token"})
            }
    
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        return None, {
            'statusCode': 500,
            'body': json.dumps({"error": "Internal server error"})
        }

def require_auth(func):
    """Decorator to enforce authentication on Lambda functions."""
    @wraps(func)
    def wrapper(event, context):
        cognito_sub, auth_error = _authenticate(event)
        if auth_error:
            return auth_error
        return func(event, context, cognito_sub)
    return wrapper

# --- Snowflake Integration ---
class SnowflakeService:
    def __init__(self):
        # Required configuration - all environment variables needed
        required_config = {
            "user": os.environ.get("SNOWFLAKE_USER"),
            "password": os.environ.get("SNOWFLAKE_PASSWORD"),
            "account": os.environ.get("SNOWFLAKE_ACCOUNT"),
            "warehouse": os.environ.get("SNOWFLAKE_WAREHOUSE"),
            "database": os.environ.get("SNOWFLAKE_DATABASE"),
            "opportunities_schema": os.environ.get("OPPORTUNITIES_SCHEMA"),
            "opportunities_table": os.environ.get("OPPORTUNITIES_TABLE"),
            "budget_schema": os.environ.get("BUDGET_SCHEMA"),
            "budget_table": os.environ.get("BUDGET_TABLE"),
        }
        
        # Check for missing required config
        missing_config = [key for key, value in required_config.items() if not value]
        if missing_config:
            env_var_names = []
            for key in missing_config:
                if key.startswith(('foundry_', 'opportunities_', 'budget_')):
                    env_var_names.append(key.upper())
                else:
                    env_var_names.append(f'SNOWFLAKE_{key.upper()}')
            raise ValueError(f"Missing required environment variables: {', '.join(env_var_names)}")
        
        self.config = required_config

    def connect(self):
        return snowflake.connector.connect(
            user=self.config["user"],
            password=self.config["password"],
            account=self.config["account"],
            warehouse=self.config["warehouse"],
            database=self.config["database"],
        )

    def execute_query(self, query, params=None):
        conn = self.connect()
        try:
            cursor = conn.cursor()
            cursor.execute(query) if not params else cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = cursor.fetchall()
            
            # Convert data and handle datetime/date objects
            data = []
            for row in results:
                row_dict = {}
                for col, value in zip(columns, row):
                    if isinstance(value, datetime):
                        row_dict[col] = value.isoformat()
                    elif isinstance(value, date):
                        row_dict[col] = value.isoformat()
                    elif isinstance(value, Decimal):
                        row_dict[col] = float(value)
                    else:
                        row_dict[col] = value
                data.append(row_dict)
            
            cursor.close()
            return data
        finally:
            conn.close()

    def get_health_info(self):
        query = "SELECT CURRENT_VERSION() as version"
        version_info = self.execute_query(query)
        return {
            "status": "healthy",
            "message": "Snowflake connection successful",
            "version": version_info[0].get("version") if version_info else "Unknown",
            "config": {
                "account": self.config["account"],
                "database": self.config["database"],
                "user": self.config["user"],
            },
        }


    def get_opportunities(self, filters=None, page=1, page_size=10, search_keywords=""):
        # Use config for table configuration
        database = self.config["database"]
        opportunities_schema = self.config["opportunities_schema"]
        opportunities_table_name = self.config["opportunities_table"]
        opportunities_table = f"{database}.{opportunities_schema}.{opportunities_table_name}"
        
        # Get columns for the opportunities table using a direct query since it's in a different database/schema
        try:
            columns_query = f"""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM {database}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '{opportunities_table_name}'
                AND TABLE_SCHEMA = '{opportunities_schema}'
                ORDER BY ORDINAL_POSITION
            """
            columns = self.execute_query(columns_query)
            column_names = [col["COLUMN_NAME"] for col in columns]
            
            if not column_names:
                return {"data": [], "total_count": 0, "message": "No columns found in opportunities table"}
                
            order_column = column_names[0] if column_names else "ID"
            
            # Build query clauses
            filter_clause = query_builder.build_filter_clause(filters or {}, column_names)
            search_clause = query_builder.build_search_clause(search_keywords, column_names)
            
            # Build WHERE clause
            if filter_clause and search_clause:
                where_clause = f"WHERE ({filter_clause}) AND ({search_clause})"
            elif filter_clause:
                where_clause = f"WHERE {filter_clause}"
            elif search_clause:
                where_clause = f"WHERE {search_clause}"
            else:
                where_clause = ""
            
            # Get total count
            count_query = f"SELECT COUNT(*) as total_count FROM {opportunities_table} {where_clause}"
            count_result = self.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0
            
            # Get paginated data
            offset = (page - 1) * page_size
            data_query = f"SELECT * FROM {opportunities_table} {where_clause} ORDER BY {query_builder.quote_identifier(order_column)} LIMIT {page_size} OFFSET {offset}"
            opportunities_data = self.execute_query(data_query)
            
            return {
                "data": opportunities_data,
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
            }
            
        except Exception as e:
            logger.error(f"Error accessing opportunities table: {e}")
            return {"data": [], "total_count": 0, "message": f"Error accessing opportunities table: {str(e)}"}

    @control_output
    def get_budget(self, filters=None, page=1, page_size=10, search_keywords=""):
        # Use config for table configuration
        database = self.config["database"]
        budget_schema = self.config["budget_schema"]
        budget_table_name = self.config["budget_table"]
        budget_table = f"{database}.{budget_schema}.{budget_table_name}"
        
        # Get columns for the budget table using a direct query since it's in a different database/schema
        try:
            columns_query = f"""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM {database}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '{budget_table_name}'
                AND TABLE_SCHEMA = '{budget_schema}'
                ORDER BY ORDINAL_POSITION
            """
            columns = self.execute_query(columns_query)
            column_names = [col["COLUMN_NAME"] for col in columns]
            
            if not column_names:
                return {"data": [], "total_count": 0, "message": "No columns found in budget table"}
                
            order_column = column_names[0] if column_names else "ID"
            
            # Build query clauses
            filter_clause = query_builder.build_filter_clause(filters or {}, column_names)
            search_clause = query_builder.build_search_clause(search_keywords, column_names)
            
            # Build WHERE clause
            if filter_clause and search_clause:
                where_clause = f"WHERE ({filter_clause}) AND ({search_clause})"
            elif filter_clause:
                where_clause = f"WHERE {filter_clause}"
            elif search_clause:
                where_clause = f"WHERE {search_clause}"
            else:
                where_clause = ""
            
            # Get total count
            count_query = f"SELECT COUNT(*) as total_count FROM {budget_table} {where_clause}"
            count_result = self.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0
            
            # Get paginated data
            offset = (page - 1) * page_size
            data_query = f"SELECT * FROM {budget_table} {where_clause} ORDER BY {query_builder.quote_identifier(order_column)} LIMIT {page_size} OFFSET {offset}"
            budget_data = self.execute_query(data_query)
            
            return {
                "data": budget_data,
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
            }
            
        except Exception as e:
            logger.error(f"Error accessing budget table: {e}")
            return {"data": [], "total_count": 0, "message": f"Error accessing budget table: {str(e)}"}

# --- Query Builder ---
class QueryBuilder:
    def __init__(self, schema=None):
        self.schema = schema

    def quote_identifier(self, identifier):
        if identifier.startswith('"') and identifier.endswith('"'):
            return identifier
        return f'"{identifier}"'

    def is_non_searchable_column(self, col_name):
        col_lower = col_name.lower()
        if (
            col_lower == "id"
            or col_lower.endswith("_id")
            or col_lower.endswith("id") and len(col_lower) > 2
        ):
            return True
        if (
            "date" in col_lower
            or "time" in col_lower
            or "timestamp" in col_lower
            or "created" in col_lower
            or "updated" in col_lower
            or "modified" in col_lower
        ):
            return True
        return False

    def build_filter_clause(self, filters, column_names=None):
        if not filters or not isinstance(filters, dict) or len(filters) == 0:
            return ""
        conditions = []
        operator = filters.get("operator", "AND")
        operator_spaced = f" {operator} "
        def column_exists(col_name):
            return not column_names or col_name in column_names
        def q(col):
            return self.quote_identifier(col)
        # Min/Max
        for key in filters:
            if key.endswith("Min") and column_exists(key[:-3]):
                col = key[:-3]
                conditions.append(f"{q(col)} >= {filters[key]}")
            if key.endswith("Max") and column_exists(key[:-3]):
                col = key[:-3]
                conditions.append(f"{q(col)} <= {filters[key]}")
        # List filters
        for key in filters:
            if (
                isinstance(filters[key], list)
                and len(filters[key]) > 0
                and column_exists(key)
            ):
                value_list = (
                    "'"
                    + "','".join([str(v).replace("'", "''") for v in filters[key]])
                    + "'"
                )
                conditions.append(f"{q(key)} IN ({value_list})")
        # Data availability
        if filters.get("dataAvailability") and isinstance(filters["dataAvailability"], list):
            data_avail_conditions = []
            for field in filters["dataAvailability"]:
                if column_exists(field):
                    data_avail_conditions.append(f"{q(field)} IS NOT NULL AND {q(field)} <> ''")
            if data_avail_conditions:
                joiner = f" {operator} "
                conditions.append(f"({joiner.join(data_avail_conditions)})")
        # Exact value filters
        if filters.get("exact_values") and isinstance(filters["exact_values"], dict):
            for field, filter_obj in filters["exact_values"].items():
                if column_exists(field):
                    if isinstance(filter_obj, dict) and "operator" in filter_obj:
                        op = filter_obj.get("operator", "=")
                        val = filter_obj.get("value", "")
                        if op in ["=", "!=", ">", "<", ">=", "<="]:
                            if isinstance(val, (int, float)):
                                conditions.append(f"{q(field)} {op} {val}")
                            else:
                                val_str = str(val).replace("'", "''")
                                conditions.append(f"{q(field)} {op} '{val_str}'")
                        elif op == "CONTAINS":
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{q(field)} ILIKE '%{val_str}%'")
                        elif op == "STARTS_WITH":
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{q(field)} ILIKE '{val_str}%'")
                        elif op == "ENDS_WITH":
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{q(field)} ILIKE '%{val_str}'")
                        elif op == "IS_NULL":
                            conditions.append(f"{q(field)} IS NULL")
                        elif op == "IS_NOT_NULL":
                            conditions.append(f"{q(field)} IS NOT NULL")
                    else:
                        val = filter_obj
                        if isinstance(val, list):
                            if len(val) > 0:
                                values_list = (
                                    "'"
                                    + "','".join([str(v).replace("'", "''") for v in val])
                                    + "'"
                                )
                                conditions.append(f"{q(field)} IN ({values_list})")
                        elif isinstance(val, (int, float)):
                            conditions.append(f"{q(field)} = {val}")
                        else:
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{q(field)} = '{val_str}'")
        filter_clause = operator_spaced.join(conditions) if conditions else ""
        logger.info(f"Built filter clause: {filter_clause}")
        return filter_clause

    def build_search_clause(self, keywords, column_names=None):
        if not keywords or keywords.strip() == "":
            return ""
        search_terms = [term.strip() for term in keywords.split(",") if term.strip()]
        if not search_terms:
            return ""
        if not column_names:
            search_conditions = []
            for term in search_terms:
                term = term.replace("'", "''")
                search_conditions.append(f"CONTAINS_TEXT('*', '{term}')")
            return " OR ".join(search_conditions)
        text_columns = [col for col in column_names if not self.is_non_searchable_column(col)]
        if not text_columns:
            logger.warning(f"No text-searchable columns found among: {column_names}")
            return ""
        all_conditions = []
        for term in search_terms:
            clean_term = term.replace("'", "''")
            exclude_term = clean_term.startswith("-")
            if exclude_term:
                clean_term = clean_term[1:]
                if not clean_term:
                    continue
                column_conditions = [f"{self.quote_identifier(col)} NOT ILIKE '%{clean_term}%'" for col in text_columns]
                all_conditions.append(" AND ".join(column_conditions))
            else:
                column_conditions = [f"{self.quote_identifier(col)} ILIKE '%{clean_term}%'" for col in text_columns]
                all_conditions.append("(" + " OR ".join(column_conditions) + ")")
        if not all_conditions:
            return ""
        return " AND ".join(all_conditions)

# --- Helper for CORS/JSON headers ---
def _get_headers(origin=None):
    return {
        'Access-Control-Allow-Origin': origin or '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json',
    }

# --- Action Functions ---
snowflake_service = SnowflakeService()
query_builder = QueryBuilder()

@require_auth
def get_snowflake_health(event, context, cognito_sub):
    origin = event['headers'].get('origin', '*')
    headers = _get_headers(origin)
    try:
        health_info = snowflake_service.get_health_info()
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps(health_info)}
    except Exception as e:
        logger.error(f"Error in get_snowflake_health: {e}")
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}


@require_auth
def get_snowflake_opportunities(event, context, cognito_sub):
    origin = event['headers'].get('origin', '*')
    headers = _get_headers(origin)
    try:
        body = json.loads(event.get('body', '{}'))
        page = int(body.get('page', 1))
        page_size = int(body.get('page_size', 10))
        search_keywords = body.get('search_keywords', '')
        filters_data = body.get('filters', {})
        result = snowflake_service.get_opportunities(
            filters=filters_data,
            page=page,
            page_size=page_size,
            search_keywords=search_keywords,
        )
        return {'statusCode': 200, 'headers': headers, 'body': result}
    except Exception as e:
        logger.error(f"Error in get_snowflake_opportunities: {e}")
        return {'statusCode': 500, 'headers': headers, 'body': {'error': str(e)}}

@control_output
@require_auth
def get_snowflake_budget(event, context, cognito_sub):
    origin = event['headers'].get('origin', '*')
    headers = _get_headers(origin)
    try:
        body = json.loads(event.get('body', '{}'))
        page = int(body.get('page', 1))
        page_size = int(body.get('page_size', 10))
        search_keywords = body.get('search_keywords', '')
        filters_data = body.get('filters', {})
        result = snowflake_service.get_budget(
            filters=filters_data,
            page=page,
            page_size=page_size,
            search_keywords=search_keywords,
        )
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps(result)}
    except Exception as e:
        logger.error(f"Error in get_snowflake_budget: {e}")
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}

# --- Lambda Handler and Action Routing ---
def _parse_body(event):
    try:
        body = event.get("body")
        if body is None:
            return {}, {"statusCode": 400, "body": json.dumps({"error": "Missing body"})}
        if isinstance(body, str):
            body = json.loads(body)
        return body, None
    except Exception as e:
        return {}, {"statusCode": 400, "body": json.dumps({"error": f"Invalid JSON body: {str(e)}"})}

def lambda_handler(event, context):
    logger.info("Received event: %s", json.dumps(event))
    try:
        origin = event['headers'].get('origin', '')
        headers = _get_headers(origin)
        
        if event['httpMethod'] == 'OPTIONS':
            # print("Handling OPTIONS request")
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps('OK')}
        
        body, body_error = _parse_body(event)
        if body_error:
            return {
                'statusCode': body_error['statusCode'],
                'headers': headers,
                'body': body_error['body']
            }
        
        # print("Parsed body:", json.dumps(body, cls=DecimalEncoder, indent=2))
        action = body.get('action')
        # print(f"Handling action: {action}")
        
        action_mapping = {

            'snowflake-health': get_snowflake_health,
            'snowflake-opportunities': get_snowflake_opportunities,
            'snowflake-budget': get_snowflake_budget,

        }
        
        action_func = action_mapping.get(action)
        
        if not action_func:
            # print(f"Error: Invalid action '{action}'")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({"error": "Invalid action"})
            }
        
        result = action_func(event, context)
        # print(f"Action completed. Status code: {result['statusCode']}")
        
        # Ensure the response body is properly serialized with DecimalEncoder
        if isinstance(result.get('body'), str):
            response_body = result['body']
        else:
            response_body = json.dumps(result.get('body', {}), cls=DecimalEncoder)
        
        return {
            'statusCode': result['statusCode'],
            'headers': headers,
            'body': response_body
        }
    
    except Exception as e:
        logger.error("Unexpected error in lambda_handler: %s", str(e))
        logger.error(traceback.format_exc())
        return {
            'statusCode': 500,
            'headers': headers if 'headers' in locals() else {},
            'body': json.dumps({'error': str(e)}, cls=DecimalEncoder)
        } 
