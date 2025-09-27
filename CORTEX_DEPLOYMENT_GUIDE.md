# Cortex Search Deployment Guide

## Overview
This guide explains how to deploy the Cortex search functionality to Railway with Python support.

## Files Added/Modified

### New Files:
- `nixpacks.toml` - Railway configuration for Python support
- `requirements.txt` - Python dependencies
- `CORTEX_DEPLOYMENT_GUIDE.md` - This guide

### Modified Files:
- `cortex_search_wrapper.py` - Enhanced with environment variable support
- `src/services/cortexSearchService.ts` - Improved Python command detection

## Railway Configuration

### 1. Environment Variables
Set these in your Railway dashboard:

```
SNOWFLAKE_ACCOUNT=TLTXFYN-YV03708
SNOWFLAKE_USER=SAGARTIWARI
SNOWFLAKE_ROLE=ACCOUNTADMIN
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=FOUNDRY
SNOWFLAKE_SCHEMA=SAM_CONTRACTS
SNOWFLAKE_PRIVATE_KEY=<your-private-key-content>
```

### 2. Private Key Setup
You have two options:

**Option A: Environment Variable (Recommended)**
- Copy the content of `rsa_key_private.pem`
- Set it as `SNOWFLAKE_PRIVATE_KEY` environment variable in Railway

**Option B: File Upload**
- Upload `rsa_key_private.pem` to your Railway project
- The script will automatically find it

## Deployment Steps

1. **Commit and push changes:**
   ```bash
   git add .
   git commit -m "Add Python support for Cortex search"
   git push
   ```

2. **Set environment variables in Railway dashboard**

3. **Deploy and test:**
   ```bash
   curl -X POST "https://apilayer-production.up.railway.app/api/v1/opportunities/cortex-search" \
     -H "Content-Type: application/json" \
     -d '{"query":"drone","limit":5}'
   ```

## Troubleshooting

### Python Not Found
- Ensure `nixpacks.toml` is committed
- Check Railway build logs for Python installation

### Private Key Issues
- Verify `SNOWFLAKE_PRIVATE_KEY` environment variable is set
- Check that the private key content is correct (no extra spaces/newlines)

### Snowflake Connection Issues
- Verify all environment variables are set correctly
- Check that the private key matches the public key in Snowflake

## Testing

### Test Cortex Search Directly
```bash
curl -X POST "https://apilayer-production.up.railway.app/api/v1/opportunities/cortex-search" \
  -H "Content-Type: application/json" \
  -d '{"query":"drone","columns":["DESCRIPTION","TITLE"],"limit":3}'
```

### Test Enhanced Opportunities Endpoint
```bash
curl -X POST "https://apilayer-production.up.railway.app/api/v1/opportunities" \
  -H "Content-Type: application/json" \
  -d '{"search_keywords":"drone","use_cortex":true,"limit":5}'
```

## Expected Response Format

```json
{
  "data": [...],
  "total_count": 5,
  "search_method": "cortex",
  "cortex_request_id": "uuid",
  "search_params": {
    "query": "drone",
    "columns": ["DESCRIPTION", "TITLE", "SOL_NUMBER", "FPDS_CODE"],
    "limit": 10
  }
}
```
