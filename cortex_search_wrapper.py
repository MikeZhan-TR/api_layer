#!/usr/bin/env python3
"""
Cortex Search Wrapper
A Python script that can be called from Node.js to perform Cortex searches
"""

import sys
import json
import os
from snowflake.core import Root
from snowflake.snowpark import Session
from cryptography.hazmat.primitives import serialization

def load_private_key():
    """Load the private key for authentication"""
    # Try multiple possible private key locations
    private_key_paths = [
        "rsa_key_private.pem",
        "/app/rsa_key_private.pem",
        os.path.join(os.getcwd(), "rsa_key_private.pem"),
        os.path.join(os.path.dirname(__file__), "rsa_key_private.pem")
    ]
    
    # Also check if private key is provided as environment variable
    private_key_content = os.environ.get("CORTEX_SNOWFLAKE_PRIVATE_KEY")
    if private_key_content:
        try:
            private_key = serialization.load_pem_private_key(
                private_key_content.encode(),
                password=None,
            )
            return private_key
        except Exception as e:
            print(json.dumps({"error": f"Failed to load private key from environment: {str(e)}"}))
            sys.exit(1)
    
    # Try file paths
    for key_path in private_key_paths:
        try:
            if os.path.exists(key_path):
                with open(key_path, "rb") as key_file:
                    private_key = serialization.load_pem_private_key(
                        key_file.read(),
                        password=None,
                    )
                return private_key
        except Exception as e:
            continue
    
    print(json.dumps({"error": f"Private key not found in any of these locations: {private_key_paths}"}))
    sys.exit(1)

def create_snowflake_session():
    """Create a Snowflake session with the private key"""
    try:
        private_key = load_private_key()
        
        connection_params = {
            "account": os.environ.get("CORTEX_SNOWFLAKE_ACCOUNT", "TLTXFYN-YV03708"),
            "user": os.environ.get("CORTEX_SNOWFLAKE_USER", "SAGARTIWARI"),
            "private_key": private_key,
            "authenticator": "SNOWFLAKE_JWT",
            "role": os.environ.get("CORTEX_SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
            "warehouse": os.environ.get("CORTEX_SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
            "database": os.environ.get("CORTEX_SNOWFLAKE_DATABASE", "FOUNDRY"),
            "schema": os.environ.get("CORTEX_SNOWFLAKE_SCHEMA", "SAM_CONTRACTS"),
        }
        
        session = Session.builder.configs(connection_params).create()
        return session
    except Exception as e:
        print(json.dumps({"error": f"Failed to create Snowflake session: {str(e)}"}))
        sys.exit(1)

def perform_cortex_search(query, columns=None, limit=10):
    """Perform Cortex search with the given parameters"""
    if columns is None:
        columns = ['DESCRIPTION', 'TITLE', 'SOL_NUMBER', 'FPDS_CODE']
    
    try:
        # Create session
        session = create_snowflake_session()
        
        # Create Root object
        root = Root(session)
        
        # Get Cortex service
        cortex_service = (root
            .databases["FOUNDRY"]
            .schemas["SAM_CONTRACTS"]
            .cortex_search_services["CONTRACT_SEARCH"]
        )
        
        # Perform search
        response = cortex_service.search(
            query=query,
            columns=columns,
            limit=limit,
        )
        
        # Convert to JSON and return
        result = response.to_json()
        return json.loads(result)
        
    except Exception as e:
        return {"error": f"Cortex search failed: {str(e)}"}

def main():
    """Main function to handle command line arguments"""
    try:
        # Get input from command line arguments or stdin
        if len(sys.argv) >= 2:
            input_json = sys.argv[1]
        else:
            # Try to read from stdin
            input_json = sys.stdin.read().strip()
        
        if not input_json:
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
        
        # Parse input JSON
        input_data = json.loads(input_json)
        
        # Extract parameters
        query = input_data.get("query", "")
        columns = input_data.get("columns", ['DESCRIPTION', 'TITLE', 'SOL_NUMBER', 'FPDS_CODE'])
        limit = input_data.get("limit", 10)
        
        if not query:
            print(json.dumps({"error": "Query parameter is required"}))
            sys.exit(1)
        
        # Perform search
        result = perform_cortex_search(query, columns, limit)
        
        # Output result
        print(json.dumps(result))
        
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Unexpected error: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
