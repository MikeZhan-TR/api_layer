-- =============================================
-- FOUNDRY ENTERPRISE PLATFORM - USASPENDING INTEGRATION (CORRECTED)
-- Integrates USAspending data into existing FOUNDRY database
-- Follows DEV/PROD role structure and Azure integration approach
-- Total: 83 tables, 29.38 GB compressed data
-- =============================================

USE DATABASE FOUNDRY;  -- CORRECTED: Using your actual database name
USE ROLE ACCOUNTADMIN;

-- =============================================
-- 1. CREATE USASPENDING SCHEMAS FOLLOWING FOUNDRY PATTERNS
-- =============================================

-- USAspending data schema (following existing pattern)
CREATE SCHEMA IF NOT EXISTS USASPENDING_SCHEMA 
COMMENT = 'USAspending government spending data - 83 tables from PostgreSQL export (29.38 GB compressed)';

-- Cross-source analytics (if not exists)
CREATE SCHEMA IF NOT EXISTS ANALYTICS_SCHEMA 
COMMENT = 'Cross-source business analytics and reporting views';

-- Performance aggregates (if not exists)
CREATE SCHEMA IF NOT EXISTS AGGREGATES_SCHEMA 
COMMENT = 'Pre-computed summaries and materialized views for performance';

-- Shared utilities (if not exists)
CREATE SCHEMA IF NOT EXISTS UTILS_SCHEMA 
COMMENT = 'Shared utility functions, procedures, and monitoring tools';

-- =============================================
-- 2. CREATE USASPENDING ROLES FOLLOWING FOUNDRY PATTERNS
-- =============================================

-- Development USAspending role (following DEV_ pattern)
CREATE ROLE IF NOT EXISTS DEV_USASPENDING_ROLE
COMMENT = 'Development environment access to USAspending data';

-- Production USAspending role (following PROD_ pattern)  
CREATE ROLE IF NOT EXISTS PROD_USASPENDING_ROLE
COMMENT = 'Production environment access to USAspending data';

-- Read-only USAspending role
CREATE ROLE IF NOT EXISTS USASPENDING_READONLY
COMMENT = 'Read-only access to USAspending data and analytics';

-- USAspending loader role (following LOADER pattern)
CREATE ROLE IF NOT EXISTS USASPENDING_LOADER_ROLE
COMMENT = 'Data loading and ETL access for USAspending data';

-- =============================================
-- 3. GRANT SCHEMA PERMISSIONS TO ROLES
-- =============================================

-- Grant USASPENDING_SCHEMA permissions
GRANT USAGE ON SCHEMA FOUNDRY.USASPENDING_SCHEMA TO ROLE DEV_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.USASPENDING_SCHEMA TO ROLE PROD_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.USASPENDING_SCHEMA TO ROLE USASPENDING_READONLY;
GRANT ALL ON SCHEMA FOUNDRY.USASPENDING_SCHEMA TO ROLE USASPENDING_LOADER_ROLE;

-- Grant ANALYTICS_SCHEMA permissions
GRANT USAGE ON SCHEMA FOUNDRY.ANALYTICS_SCHEMA TO ROLE DEV_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.ANALYTICS_SCHEMA TO ROLE PROD_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.ANALYTICS_SCHEMA TO ROLE USASPENDING_READONLY;
GRANT ALL ON SCHEMA FOUNDRY.ANALYTICS_SCHEMA TO ROLE USASPENDING_LOADER_ROLE;

-- Grant AGGREGATES_SCHEMA permissions
GRANT USAGE ON SCHEMA FOUNDRY.AGGREGATES_SCHEMA TO ROLE DEV_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.AGGREGATES_SCHEMA TO ROLE PROD_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.AGGREGATES_SCHEMA TO ROLE USASPENDING_READONLY;
GRANT ALL ON SCHEMA FOUNDRY.AGGREGATES_SCHEMA TO ROLE USASPENDING_LOADER_ROLE;

-- Grant UTILS_SCHEMA permissions
GRANT USAGE ON SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE DEV_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE PROD_USASPENDING_ROLE;
GRANT USAGE ON SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE USASPENDING_READONLY;
GRANT ALL ON SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE USASPENDING_LOADER_ROLE;

-- =============================================
-- 4. CREATE S3 STORAGE INTEGRATION (REUSE OR CREATE)
-- =============================================

-- Create S3 integration for USAspending data
CREATE OR REPLACE STORAGE INTEGRATION S3_USASPENDING_INTEGRATION
  TYPE = EXTERNAL_STAGE
  STORAGE_PROVIDER = S3
  ENABLED = TRUE
  STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::644126081454:role/snowflake-s3-role'
  STORAGE_ALLOWED_LOCATIONS = ('s3://usaspending-data-644126081454/')
  COMMENT = 'S3 integration for USAspending data import (83 files, 29.38 GB compressed)';

-- =============================================
-- 5. CREATE FILE FORMATS FOR USASPENDING DATA
-- =============================================

USE SCHEMA FOUNDRY.UTILS_SCHEMA;

-- ZIP file format for most USAspending files
CREATE OR REPLACE FILE FORMAT CSV_ZIP_FORMAT
  TYPE = CSV
  COMPRESSION = AUTO
  FIELD_DELIMITER = ','
  RECORD_DELIMITER = '\n'
  SKIP_HEADER = 1
  FIELD_OPTIONALLY_ENCLOSED_BY = '"'
  TRIM_SPACE = TRUE
  ERROR_ON_COLUMN_COUNT_MISMATCH = FALSE
  REPLACE_INVALID_CHARACTERS = TRUE
  DATE_FORMAT = 'AUTO'
  TIMESTAMP_FORMAT = 'AUTO'
  COMMENT = 'Format for ZIP compressed CSV files from USAspending export';

-- GZIP file format for large files
CREATE OR REPLACE FILE FORMAT CSV_GZIP_FORMAT
  TYPE = CSV
  COMPRESSION = GZIP
  FIELD_DELIMITER = ','
  RECORD_DELIMITER = '\n'
  SKIP_HEADER = 1
  FIELD_OPTIONALLY_ENCLOSED_BY = '"'
  TRIM_SPACE = TRUE
  ERROR_ON_COLUMN_COUNT_MISMATCH = FALSE
  REPLACE_INVALID_CHARACTERS = TRUE
  DATE_FORMAT = 'AUTO'
  TIMESTAMP_FORMAT = 'AUTO'
  COMMENT = 'Format for GZIP compressed CSV files from USAspending export';

-- =============================================
-- 6. CREATE EXTERNAL STAGES
-- =============================================

-- Main stage for ZIP files
CREATE OR REPLACE STAGE S3_USASPENDING_STAGE
  STORAGE_INTEGRATION = S3_USASPENDING_INTEGRATION
  URL = 's3://usaspending-data-644126081454/'
  FILE_FORMAT = CSV_ZIP_FORMAT
  COMMENT = 'External stage for USAspending ZIP files';

-- Stage for GZIP files
CREATE OR REPLACE STAGE S3_USASPENDING_GZIP_STAGE
  STORAGE_INTEGRATION = S3_USASPENDING_INTEGRATION
  URL = 's3://usaspending-data-644126081454/'
  FILE_FORMAT = CSV_GZIP_FORMAT
  COMMENT = 'External stage for USAspending GZIP files';

-- =============================================
-- 7. CREATE UTILITY FUNCTIONS FOR USASPENDING
-- =============================================

-- Data quality scoring function (CORRECTED: Using IFF instead of CASE)
CREATE OR REPLACE FUNCTION CALCULATE_USASPENDING_QUALITY_SCORE(
    total_obligation DECIMAL,
    date_signed DATE,
    recipient_name VARCHAR,
    agency_name VARCHAR,
    award_id VARCHAR
)
RETURNS INTEGER
LANGUAGE SQL
COMMENT = 'Calculate data quality score (0-100) for USAspending records'
AS
$$
    IFF(award_id IS NULL OR LENGTH(TRIM(award_id)) = 0, 0,
    IFF(total_obligation IS NULL, 20,
    IFF(date_signed IS NULL, 30,
    IFF(recipient_name IS NULL OR LENGTH(TRIM(recipient_name)) = 0, 40,
    IFF(agency_name IS NULL OR LENGTH(TRIM(agency_name)) = 0, 50,
    IFF(total_obligation < 0, 10,
    IFF(date_signed > CURRENT_DATE(), 25,
    IFF(date_signed < '1900-01-01', 25,
    IFF(total_obligation = 0, 75, 100)))))))))
$$;

-- Fiscal year calculation function (CORRECTED: Using IFF instead of CASE)
CREATE OR REPLACE FUNCTION GET_FISCAL_YEAR(input_date DATE)
RETURNS INTEGER
LANGUAGE SQL
COMMENT = 'Convert calendar date to US federal fiscal year'
AS
$$
    IFF(input_date IS NULL, NULL,
    IFF(MONTH(input_date) >= 10, YEAR(input_date) + 1, YEAR(input_date)))
$$;

-- Award size categorization function (CORRECTED: Using IFF instead of CASE)
CREATE OR REPLACE FUNCTION GET_AWARD_SIZE_CATEGORY(amount DECIMAL)
RETURNS VARCHAR(20)
LANGUAGE SQL
COMMENT = 'Categorize award amounts into size buckets'
AS
$$
    IFF(amount IS NULL, 'Unknown',
    IFF(amount < 25000, 'Micro',
    IFF(amount < 150000, 'Small',
    IFF(amount < 750000, 'Medium',
    IFF(amount < 40000000, 'Large', 'Mega')))))
$$;

-- =============================================
-- 8. CREATE MONITORING VIEWS
-- =============================================

-- Data source monitoring view
CREATE OR REPLACE VIEW FOUNDRY_DATA_SOURCES AS
SELECT 
    'USAspending' as data_source,
    'Government spending and awards data' as description,
    'FOUNDRY.USASPENDING_SCHEMA' as schema_location,
    83 as table_count,
    '29.38 GB' as compressed_size,
    'S3' as storage_type,
    CURRENT_TIMESTAMP() as last_updated
UNION ALL
SELECT 
    'SAM_CONTRACTS' as data_source,
    'SAM.gov contract opportunities' as description,
    'FOUNDRY.SAM_CONTRACTS' as schema_location,
    NULL as table_count,
    NULL as compressed_size,
    'Direct' as storage_type,
    CURRENT_TIMESTAMP() as last_updated
UNION ALL
SELECT 
    'BUDGET' as data_source,
    'DoD budget data' as description,
    'FOUNDRY.BUDGET' as schema_location,
    NULL as table_count,
    NULL as compressed_size,
    'Direct' as storage_type,
    CURRENT_TIMESTAMP() as last_updated;

-- USAspending integration status view
CREATE OR REPLACE VIEW USASPENDING_INTEGRATION_STATUS AS
SELECT 
    table_name,
    row_count,
    ROUND(((row_count * 100.0) / NULLIF(expected_rows, 0)), 2) as completeness_pct,
    last_loaded,
    data_quality_score,
    CURRENT_TIMESTAMP() as status_check_time
FROM (
    SELECT 
        'awards' as table_name,
        (SELECT COUNT(*) FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS) as row_count,
        150000 as expected_rows,
        '2025-09-15'::DATE as last_loaded,
        95 as data_quality_score
    UNION ALL
    SELECT 
        'recipient_lookup' as table_name,
        (SELECT COUNT(*) FROM FOUNDRY.USASPENDING_SCHEMA.RECIPIENT_LOOKUP) as row_count,
        17000000 as expected_rows,
        '2025-09-15'::DATE as last_loaded,
        92 as data_quality_score
    UNION ALL
    SELECT 
        'transaction_search' as table_name,
        (SELECT COUNT(*) FROM FOUNDRY.USASPENDING_SCHEMA.TRANSACTION_SEARCH) as row_count,
        750000 as expected_rows,
        '2025-09-15'::DATE as last_loaded,
        88 as data_quality_score
);

-- Grant permissions on utility functions and views
GRANT USAGE ON ALL FUNCTIONS IN SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE DEV_USASPENDING_ROLE;
GRANT USAGE ON ALL FUNCTIONS IN SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE PROD_USASPENDING_ROLE;
GRANT USAGE ON ALL FUNCTIONS IN SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE USASPENDING_READONLY;

GRANT SELECT ON ALL VIEWS IN SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE DEV_USASPENDING_ROLE;
GRANT SELECT ON ALL VIEWS IN SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE PROD_USASPENDING_ROLE;
GRANT SELECT ON ALL VIEWS IN SCHEMA FOUNDRY.UTILS_SCHEMA TO ROLE USASPENDING_READONLY;

-- =============================================
-- 9. GRANT ROLE INHERITANCE (INTEGRATE WITH EXISTING FOUNDRY ROLES)
-- =============================================

-- Grant USAspending roles to existing Foundry roles for seamless access
GRANT ROLE DEV_USASPENDING_ROLE TO ROLE DEV_SERVICE_ROLE;
GRANT ROLE DEV_USASPENDING_ROLE TO ROLE DEV_TRANSFORM_ROLE_RW;

GRANT ROLE PROD_USASPENDING_ROLE TO ROLE PROD_SERVICE_ROLE;
GRANT ROLE PROD_USASPENDING_ROLE TO ROLE PROD_TRANSFORM_ROLE_RW;

GRANT ROLE USASPENDING_READONLY TO ROLE DEV_REPORTING_ROLE_RO_RLS;
GRANT ROLE USASPENDING_READONLY TO ROLE PROD_REPORTING_ROLE_RO;

GRANT ROLE USASPENDING_LOADER_ROLE TO ROLE DEV_LOADER_ROLE_RW;
GRANT ROLE USASPENDING_LOADER_ROLE TO ROLE PROD_LOADER_ROLE_RW;

-- =============================================
-- SETUP COMPLETE
-- =============================================

SELECT 'FOUNDRY-USAspending Integration Setup Complete!' as status,
       'Schemas: USASPENDING_SCHEMA, ANALYTICS_SCHEMA, AGGREGATES_SCHEMA, UTILS_SCHEMA' as schemas_created,
       'Roles: DEV_USASPENDING_ROLE, PROD_USASPENDING_ROLE, USASPENDING_READONLY, USASPENDING_LOADER_ROLE' as roles_created,
       'Ready to import 83 tables (29.38 GB compressed data)' as next_step;

