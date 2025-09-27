# Opportunities Sync Edge Function API

## Overview

The `opportunities-sync` edge function serves as a bridge between your application and the Railway API layer, providing access to government contract opportunities data from Snowflake. It offers data fetching, searching, and synchronization capabilities with built-in caching and error handling.

## API Endpoint

```
POST https://dcbiwberplplqfcpvexn.supabase.co/functions/v1/opportunities-sync
```

## Authentication

This function is configured as **public** (`verify_jwt = false`) and does not require authentication.

## Available Actions

The function supports 4 main actions, specified in the request body:

### 1. `fetch_opportunities`

Fetches opportunities from the external API with optional filtering and pagination.

**Request:**
```json
{
  "action": "fetch_opportunities",
  "filters": {
    "limit": 100,
    "offset": 0,
    "posted_date_from": "2024-01-01",
    "posted_date_to": "2024-12-31",
    "agency": "Department of Defense",
    "set_aside": "Small Business",
    "place_of_performance": "California",
    "naics_code": "541511"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "opportunity_id": "12345",
      "title": "IT Services Contract",
      "agency": "Department of Defense",
      "posted_date": "2024-01-15",
      "response_date": "2024-02-15",
      "set_aside": "Small Business",
      "naics_code": "541511",
      "place_of_performance": "California",
      "description": "Contract description...",
      "point_of_contact": "john.doe@agency.gov"
    }
  ],
  "cached": false,
  "cache_expires_at": "2024-01-15T10:30:00Z"
}
```

### 2. `get_schema`

Retrieves the schema definition for opportunities data.

**Request:**
```json
{
  "action": "get_schema"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fields": [
      {
        "name": "opportunity_id",
        "type": "string",
        "description": "Unique identifier for the opportunity"
      },
      {
        "name": "title",
        "type": "string",
        "description": "Title of the contract opportunity"
      }
    ]
  }
}
```

### 3. `search_opportunities`

Advanced search functionality with complex filtering capabilities.

**Request:**
```json
{
  "action": "search_opportunities",
  "filters": {
    "keyword": "cybersecurity",
    "agency": "Department of Homeland Security",
    "min_value": 100000,
    "max_value": 5000000,
    "posted_date_from": "2024-01-01",
    "set_aside": ["Small Business", "SDVOSB"],
    "naics_codes": ["541511", "541512"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "opportunity_id": "67890",
      "title": "Cybersecurity Assessment Services",
      "agency": "Department of Homeland Security",
      "estimated_value": 2500000,
      "relevance_score": 0.95
    }
  ],
  "total_results": 1,
  "cached": true
}
```

### 4. `sync_contracts`

Syncs opportunities data to the local Supabase `contracts` table with data transformation.

**Request:**
```json
{
  "action": "sync_contracts",
  "filters": {
    "posted_date_from": "2024-01-01",
    "agency": "Department of Defense"
  },
  "sync_options": {
    "batch_size": 50,
    "upsert": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "synced_count": 150,
    "skipped_count": 5,
    "error_count": 0,
    "batch_count": 3
  }
}
```

## Filter Parameters

### Common Filters
- `limit` (number): Maximum number of records to return (default: 100)
- `offset` (number): Number of records to skip for pagination (default: 0)
- `posted_date_from` (string): Start date in YYYY-MM-DD format
- `posted_date_to` (string): End date in YYYY-MM-DD format
- `response_date_from` (string): Response deadline start date
- `response_date_to` (string): Response deadline end date

### Opportunity-specific Filters
- `agency` (string): Government agency name
- `set_aside` (string|array): Set-aside type(s) (e.g., "Small Business", "SDVOSB")
- `place_of_performance` (string): Location where work will be performed
- `naics_code` (string): NAICS classification code
- `naics_codes` (array): Multiple NAICS codes
- `keyword` (string): Search term for title/description
- `min_value` (number): Minimum estimated contract value
- `max_value` (number): Maximum estimated contract value

## Sync Options

When using `sync_contracts` action:

- `batch_size` (number): Number of records to process per batch (default: 100)
- `upsert` (boolean): Whether to update existing records or insert only (default: true)

## Caching

The function implements intelligent caching:

- **Cache Duration**: 5 minutes (300 seconds)
- **Cache Key**: Based on action and filter parameters
- **Cache Indicators**: Response includes `cached` boolean and `cache_expires_at` timestamp
- **Cache Bypass**: Automatic for data modifications or when cache expires

## Data Transformation

When syncing to the `contracts` table, the following transformations are applied:

| Source Field | Target Field | Transformation |
|--------------|--------------|----------------|
| `opportunity_id` | `contract_id` | Direct mapping |
| `title` | `title` | Direct mapping |
| `agency` | `agency` | Direct mapping |
| `posted_date` | `posted_date` | ISO date conversion |
| `response_date` | `due_date` | ISO date conversion |
| `estimated_value` | `value` | Numeric conversion |
| `description` | `description` | Direct mapping |
| `set_aside` | `set_aside_type` | Direct mapping |
| `naics_code` | `naics_code` | Direct mapping |
| `place_of_performance` | `location` | Direct mapping |
| `point_of_contact` | `contact_email` | Direct mapping |

Additional fields added during sync:
- `created_at`: Current timestamp
- `updated_at`: Current timestamp
- `sync_source`: "opportunities-api"

## Error Handling

### Common Error Responses

**Invalid Action:**
```json
{
  "success": false,
  "error": "Invalid action specified",
  "message": "Action must be one of: fetch_opportunities, get_schema, search_opportunities, sync_contracts"
}
```

**External API Error:**
```json
{
  "success": false,
  "error": "External API error",
  "message": "Failed to fetch data from Railway API",
  "details": "Connection timeout after 30 seconds"
}
```

**Database Sync Error:**
```json
{
  "success": false,
  "error": "Database sync failed",
  "message": "Failed to insert records into contracts table",
  "details": "Column 'agency' violates not-null constraint"
}
```

### HTTP Status Codes

- `200`: Success
- `400`: Bad Request (missing required parameters)
- `500`: Internal Server Error
- `502`: External API unavailable
- `504`: Request timeout

## Usage Examples

### JavaScript/TypeScript

```typescript
import { supabase } from '@/integrations/supabase/client';

// Fetch opportunities
const { data, error } = await supabase.functions.invoke('opportunities-sync', {
  body: {
    action: 'fetch_opportunities',
    filters: {
      agency: 'Department of Defense',
      limit: 50
    }
  }
});

// Sync to local database
const syncResult = await supabase.functions.invoke('opportunities-sync', {
  body: {
    action: 'sync_contracts',
    filters: {
      posted_date_from: '2024-01-01'
    },
    sync_options: {
      batch_size: 100,
      upsert: true
    }
  }
});
```

### curl

```bash
# Fetch opportunities
curl -X POST 'https://dcbiwberplplqfcpvexn.supabase.co/functions/v1/opportunities-sync' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "fetch_opportunities",
    "filters": {
      "agency": "Department of Defense",
      "limit": 50
    }
  }'

# Search opportunities
curl -X POST 'https://dcbiwberplplqfcpvexn.supabase.co/functions/v1/opportunities-sync' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "search_opportunities",
    "filters": {
      "keyword": "cybersecurity",
      "min_value": 100000
    }
  }'
```

## Performance Considerations

- **Caching**: Responses are cached for 5 minutes to reduce external API calls
- **Batch Processing**: Sync operations process data in configurable batches
- **Rate Limiting**: External API calls are subject to Railway API rate limits
- **Timeout**: Requests timeout after 30 seconds

## Security

- **CORS**: Configured to allow cross-origin requests from any domain
- **No Authentication**: Function is public and doesn't require JWT verification
- **Input Validation**: All filter parameters are validated before processing
- **SQL Injection Protection**: Uses parameterized queries for database operations

## Monitoring and Debugging

Monitor function performance and errors through:
- [Edge Function Logs](https://supabase.com/dashboard/project/dcbiwberplplqfcpvexn/functions/opportunities-sync/logs)
- Response timing and cache hit rates in function logs
- Database sync statistics in sync response data

## Integration Notes

This function is designed to work with:
- **Railway API Layer**: External government contracting data source
- **Supabase Contracts Table**: Local data storage for synchronized opportunities
- **Frontend Applications**: Direct API consumption via Supabase client

For implementation details, see the source code at `supabase/functions/opportunities-sync/index.ts`.