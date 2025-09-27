import os
from snowflake.core import Root
from snowflake.snowpark import Session
from cryptography.hazmat.primitives import serialization

# Read the private key file
with open("rsa_key_private.pem", "rb") as key_file:
    private_key = serialization.load_pem_private_key(
        key_file.read(),
        password=None,
    )

# Using the same credentials we've been using
CONNECTION_PARAMETERS = {
    "account": "TLTXFYN-YV03708",
    "user": "SAGARTIWARI",
    "private_key": private_key,
    "authenticator": "SNOWFLAKE_JWT",
    "role": "ACCOUNTADMIN",
    "warehouse": "COMPUTE_WH",
    "database": "FOUNDRY",
    "schema": "SAM_CONTRACTS",
}

try:
    print("Creating Snowflake session...")
    session = Session.builder.configs(CONNECTION_PARAMETERS).create()
    print("Session created successfully!")
    
    print("Creating Root object...")
    root = Root(session)
    print("Root object created successfully!")
    
    print("Fetching Cortex service...")
    my_service = (root
        .databases["FOUNDRY"]
        .schemas["SAM_CONTRACTS"]
        .cortex_search_services["CONTRACT_SEARCH"]
    )
    print("Service fetched successfully!")
    
    print("Querying service for 'drone'...")
    resp = my_service.search(
        query="drone",
        columns=["DESCRIPTION", "TITLE", "SOL_NUMBER", "FPDS_CODE"],
        limit=10,
    )
    
    print("Search completed successfully!")
    print("Response:")
    print(resp.to_json())
    
except Exception as e:
    print(f"Error: {e}")
    print(f"Error type: {type(e)}")
    import traceback
    traceback.print_exc()
