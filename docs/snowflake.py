"""Consolidated Snowflake service for all data access"""

import os
import json
import threading
import time
from datetime import datetime, date
from decimal import Decimal
from dataclasses import dataclass
import logging
import pandas as pd
import snowflake.connector
from typing import Dict, List, Any, Optional
from contextlib import contextmanager
from queue import Queue, Empty

from flask import Blueprint, jsonify, request

# You no longer need to import snowflake_service from another file,
# since it's defined here in this combined file.
# Likewise, helpers can be implemented or imported depending on your project structure.
# Keeping usage references intact as per your request.

from app.utils.helpers import create_api_response, handle_api_error

logger = logging.getLogger(__name__)


@dataclass
class BudgetInsight:
    """Structure for budget intelligence insights"""

    category: str
    title: str
    description: str
    value: Any
    trend: Optional[str] = None
    confidence: Optional[float] = None
    actionable: Optional[str] = None


class SnowflakeConnectionPool:
    """Thread-safe Snowflake connection pool"""
    
    def __init__(self, max_connections: int = 5, max_idle_time: int = 300):
        """
        Initialize connection pool
        
        Args:
            max_connections: Maximum number of connections in pool
            max_idle_time: Max seconds a connection can be idle before closing
        """
        self.max_connections = max_connections
        self.max_idle_time = max_idle_time
        self.config = self._get_config()
        
        # Thread-safe connection pool
        self._pool = Queue(maxsize=max_connections)
        self._active_connections = 0
        self._lock = threading.Lock()
        
        # Connection tracking
        self._connection_times = {}
        
        logger.info(f"Initialized Snowflake connection pool (max: {max_connections})")
    
    def _get_config(self) -> Dict[str, Any]:
        """Get Snowflake configuration from environment"""
        # Use budget-specific configs if available, fallback to generic ones
        database = os.getenv("SNOWFLAKE_BUDGET_DATABASE") or os.getenv("SNOWFLAKE_DATABASE", "FOUNDRY")
        schema = os.getenv("SNOWFLAKE_BUDGET_SCHEMA") or os.getenv("SNOWFLAKE_SCHEMA", "BUDGET")
        
        config = {
            "user": os.getenv("SNOWFLAKE_USER"),
            "password": os.getenv("SNOWFLAKE_PASSWORD"),
            "account": os.getenv("SNOWFLAKE_ACCOUNT"),
            "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
            "database": database,
            "schema": schema,
            "role": os.getenv("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
            # Connection pool settings
            "client_session_keep_alive": True,
            "client_session_keep_alive_heartbeat_frequency": 900,  # 15 minutes
            # Additional reliability settings
            "login_timeout": 60,
            "network_timeout": 60,
        }
        
        # Remove None values
        return {k: v for k, v in config.items() if v is not None}
    
    def _create_connection(self):
        """Create a new Snowflake connection"""
        try:
            connection = snowflake.connector.connect(**self.config)
            connection_id = id(connection)
            self._connection_times[connection_id] = time.time()
            
            logger.info(f"Created new Snowflake connection: {connection_id}")
            return connection
            
        except Exception as e:
            logger.error(f"Failed to create Snowflake connection: {e}")
            raise
    
    def _is_connection_valid(self, connection) -> bool:
        """Check if connection is still valid and not too old"""
        try:
            connection_id = id(connection)
            
            # Check if connection is too old
            if connection_id in self._connection_times:
                age = time.time() - self._connection_times[connection_id]
                if age > self.max_idle_time:
                    logger.info(f"Connection {connection_id} expired after {age:.1f}s")
                    return False
            
            # Quick check if connection is still open (avoid expensive query)
            if hasattr(connection, 'is_closed') and connection.is_closed():
                return False
                
            # Less frequent validation query (only 1 in 10 times)
            if connection_id % 10 == 0:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
            
            return True
            
        except Exception as e:
            logger.warning(f"Connection validation failed: {e}")
            return False
    
    @contextmanager
    def get_connection(self):
        """
        Get a connection from the pool (context manager)
        
        Usage:
            with pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ...")
        """
        connection = None
        
        try:
            # Try to get existing connection from pool
            try:
                connection = self._pool.get_nowait()
                
                # Validate connection
                if not self._is_connection_valid(connection):
                    try:
                        connection.close()
                    except:
                        pass
                    connection = None
                    
            except Empty:
                pass  # No available connections
            
            # Create new connection if needed
            if connection is None:
                with self._lock:
                    if self._active_connections < self.max_connections:
                        connection = self._create_connection()
                        self._active_connections += 1
                    else:
                        # Wait for a connection to become available (increased timeout)
                        try:
                            connection = self._pool.get(timeout=60)
                            
                            if not self._is_connection_valid(connection):
                                try:
                                    connection.close()
                                except:
                                    pass
                                connection = self._create_connection()
                        except Empty:
                            # If still no connection available, raise error instead of hanging
                            raise Exception("Connection pool exhausted - no connections available within timeout")
            
            yield connection
            
        except Exception as e:
            logger.error(f"Error getting connection from pool: {e}")
            raise
            
        finally:
            # Return connection to pool
            if connection is not None:
                try:
                    if self._is_connection_valid(connection):
                        self._pool.put_nowait(connection)
                    else:
                        # Connection is invalid, close it
                        try:
                            connection.close()
                        except:
                            pass
                        
                        with self._lock:
                            self._active_connections -= 1
                            connection_id = id(connection)
                            if connection_id in self._connection_times:
                                del self._connection_times[connection_id]
                                
                except Exception as e:
                    logger.warning(f"Error returning connection to pool: {e}")
    
    def close_all(self):
        """Close all connections in the pool"""
        logger.info("Closing all connections in pool")
        
        # Close all pooled connections
        while not self._pool.empty():
            try:
                connection = self._pool.get_nowait()
                connection.close()
            except (Empty, Exception) as e:
                logger.warning(f"Error closing pooled connection: {e}")
        
        # Clear tracking
        with self._lock:
            self._active_connections = 0
            self._connection_times.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics"""
        return {
            "max_connections": self.max_connections,
            "active_connections": self._active_connections,
            "pooled_connections": self._pool.qsize(),
            "max_idle_time": self.max_idle_time,
        }


# Global connection pool instance
_connection_pool: Optional[SnowflakeConnectionPool] = None


def get_connection_pool() -> SnowflakeConnectionPool:
    """Get or create the global connection pool"""
    global _connection_pool
    
    if _connection_pool is None:
        _connection_pool = SnowflakeConnectionPool(
            max_connections=int(os.getenv("SNOWFLAKE_MAX_CONNECTIONS", "5")),
            max_idle_time=int(os.getenv("SNOWFLAKE_MAX_IDLE_TIME", "300"))
        )
    
    return _connection_pool


def close_connection_pool():
    """Close the global connection pool"""
    global _connection_pool
    
    if _connection_pool is not None:
        _connection_pool.close_all()
        _connection_pool = None


class SnowflakeService:
    def __init__(self):
        self.config = {
            "user": os.environ.get("SNOWFLAKE_USER"),
            "password": os.environ.get("SNOWFLAKE_PASSWORD"),
            "account": os.environ.get("SNOWFLAKE_ACCOUNT"),
            "warehouse": os.environ.get("SNOWFLAKE_WAREHOUSE"),
            "database": os.environ.get("SNOWFLAKE_DATABASE"),
            "schema": os.environ.get("SNOWFLAKE_SCHEMA"),
        }

    def connect(self):
        """Create a Snowflake connection"""
        return snowflake.connector.connect(
            user=self.config["user"],
            password=self.config["password"],
            account=self.config["account"],
            warehouse=self.config["warehouse"],
            database=self.config["database"],
            schema=self.config["schema"],
        )

    def execute_query(self, query: str, params: Optional[List] = None) -> List[Dict]:
        """Execute a query and return results as list of dictionaries"""
        conn = self.connect()
        try:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
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

    def get_health_info(self) -> Dict:
        """Check Snowflake connection health"""
        try:
            query = "SELECT CURRENT_VERSION() as version"
            version_info = self.execute_query(query)
            return {
                "status": "healthy",
                "message": "Snowflake connection successful",
                "version": version_info[0].get("version") if version_info else "Unknown",
                "config": {
                    "account": self.config["account"],
                    "database": self.config["database"],
                    "schema": self.config["schema"],
                    "user": self.config["user"],
                },
            }
        except Exception as e:
            logger.error(f"Snowflake health check failed: {e}")
            raise

    def get_metadata(self) -> Dict:
        """Get table metadata for opportunities"""
        try:
            # Use the opportunities table from environment
            opportunities_table = os.environ.get("SNOWFLAKE_OPPORTUNITIES_TABLE", "RAW_CSV")
            schema = self.config["schema"]

            # Get columns for the opportunities table
            columns_query = f"""
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{opportunities_table}'
              AND TABLE_SCHEMA = '{schema}'
            ORDER BY ORDINAL_POSITION
            """
            columns = self.execute_query(columns_query)

            metadata = {}
            for col in columns:
                col_name = col["COLUMN_NAME"]
                metadata[col_name] = {
                    "column_name": col_name,
                    "data_type": col["DATA_TYPE"],
                    "table": "opportunities",
                }

            return {
                "metadata": metadata,
                "tables": {"opportunities": opportunities_table}
            }
        except Exception as e:
            logger.error(f"Error getting metadata: {e}")
            raise

    def get_opportunities(self, filters: Optional[Dict] = None, page: int = 1, page_size: int = 10, search_keywords: str = "") -> Dict:
        """Get opportunities data with filtering, pagination, and search"""
        try:
            # Use environment variables for table configuration
            database = self.config["database"]
            schema = self.config["schema"]
            table_name = os.environ.get("SNOWFLAKE_OPPORTUNITIES_TABLE", "RAW_CSV")
            opportunities_table = f"{database}.{schema}.{table_name}"

            # Get columns for the opportunities table
            columns_query = f"""
            SELECT COLUMN_NAME, DATA_TYPE
            FROM {database}.INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{table_name}'
              AND TABLE_SCHEMA = '{schema}'
            ORDER BY ORDINAL_POSITION
            """
            columns = self.execute_query(columns_query)
            column_names = [col["COLUMN_NAME"] for col in columns]
            if not column_names:
                return {"data": [], "total_count": 0, "message": "No columns found in opportunities table"}

            order_column = column_names[0] if column_names else "ID"

            # Build query clauses using the query builder
            query_builder = QueryBuilder()
            filter_clause = query_builder.build_filter_clause(filters or {}, column_names)
            search_clause = query_builder.build_search_clause(search_keywords, column_names)

            # Build WHERE clause
            where_conditions = []
            if filter_clause:
                where_conditions.append(f"({filter_clause})")
            if search_clause:
                where_conditions.append(f"({search_clause})")
            where_clause = "" if where_conditions == [] else f"WHERE {' AND '.join(where_conditions)}"

            # Get total count
            count_query = f"SELECT COUNT(*) as total_count FROM {opportunities_table} {where_clause}"
            count_result = self.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0

            # Get paginated data
            offset = (page - 1) * page_size
            data_query = f"""
            SELECT *
            FROM {opportunities_table}
            {where_clause}
            ORDER BY {query_builder.quote_identifier(order_column)}
            LIMIT {page_size}
            OFFSET {offset}
            """
            opportunities_data = self.execute_query(data_query)

            return {
                "data": opportunities_data,
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
            }
        except Exception as e:
            logger.error(f"Error accessing opportunities table: {e}")
            raise


class QueryBuilder:
    """Build SQL query clauses for filtering and searching"""

    def quote_identifier(self, identifier: str) -> str:
        """Quote SQL identifier"""
        if identifier.startswith('"') and identifier.endswith('"'):
            return identifier
        return f'"{identifier}"'

    def is_non_searchable_column(self, col_name: str) -> bool:
        """Check if column should be excluded from text search"""
        col_lower = col_name.lower()
        # ID columns
        if (col_lower == "id" or col_lower.endswith("_id") or (col_lower.endswith("id") and len(col_lower) > 2)):
            return True
        # Date/time columns
        if any(term in col_lower for term in ["date", "time", "timestamp", "created", "updated", "modified"]):
            return True
        return False

    def build_filter_clause(self, filters: Dict, column_names: Optional[List[str]] = None) -> str:
        """Build WHERE clause from filters"""
        if not filters or not isinstance(filters, dict) or len(filters) == 0:
            return ""

        conditions = []
        operator = filters.get("operator", "AND")

        def column_exists(col_name: str) -> bool:
            return not column_names or col_name in column_names

        # Special handling for contract_type filter (exact TYPE values)
        if "contract_type" in filters and isinstance(filters["contract_type"], list):
            # Filter by exact TYPE values
            type_list = "'" + "','".join([str(v).replace("'", "''") for v in filters["contract_type"]]) + "'"
            conditions.append(f'"TYPE" IN ({type_list})')

        # Special handling for has_execution_data filter
        if "has_execution_data" in filters:
            if filters["has_execution_data"] is True:
                # Records with USA Spending data (assuming joined table has usa spending columns)
                conditions.append('(\"AWARD_ID_PIID\" IS NOT NULL AND \"AWARD_ID_PIID\" <> \'\')')
            elif filters["has_execution_data"] is False:
                # Records without USA Spending data (SAM.gov only)
                conditions.append('(\"AWARD_ID_PIID\" IS NULL OR \"AWARD_ID_PIID\" = \'\')')

        # Financial range filters
        if "min_award_amount" in filters and filters["min_award_amount"] is not None:
            conditions.append(f'"AWARD$" >= {filters["min_award_amount"]}')
        if "max_award_amount" in filters and filters["max_award_amount"] is not None:
            conditions.append(f'"AWARD$" <= {filters["max_award_amount"]}')

        # Advanced text filters (based on actual schema)
        if "agency" in filters and filters["agency"]:
            agency_value = str(filters["agency"]).replace("'", "''")
            conditions.append(f'"Department/Ind.Agency" ILIKE \'%{agency_value}%\'')
        if "naics_code" in filters and filters["naics_code"]:
            naics_value = str(filters["naics_code"]).replace("'", "''")
            # NAICSCODE is NUMBER type, NAICS_CODE is VARCHAR type
            if naics_value.isdigit():
                # For exact numeric match on NAICSCODE
                conditions.append(f'(\"NAICSCODE\" = {naics_value} OR \"NAICS_CODE\" ILIKE \'%{naics_value}%\')')
            else:
                # For text search only on NAICS_CODE (VARCHAR field)
                conditions.append(f'"NAICS_CODE" ILIKE \'%{naics_value}%\'')
        if "awardee" in filters and filters["awardee"]:
            awardee_value = str(filters["awardee"]).replace("'", "''")
            conditions.append(f'"AWARDEE" ILIKE \'%{awardee_value}%\'')
        if "psc_code" in filters and filters["psc_code"]:
            psc_value = str(filters["psc_code"]).replace("'", "''")
            conditions.append(f'"PRODUCT_OR_SERVICE_CODE" ILIKE \'%{psc_value}%\'')
        if "award_id" in filters and filters["award_id"]:
            award_id_value = str(filters["award_id"]).replace("'", "''")
            # Search both AWARDNUMBER and AWARD_ID_PIID columns
            conditions.append(f'(\"AWARDNUMBER\" ILIKE \'%{award_id_value}%\' OR \"AWARD_ID_PIID\" ILIKE \'%{award_id_value}%\')')

        # Date range filters (AWARDDATE is DATE type)
        if "award_date_start" in filters and filters["award_date_start"]:
            conditions.append(f'"AWARDDATE" >= \'{filters["award_date_start"]}\'')
        if "award_date_end" in filters and filters["award_date_end"]:
            conditions.append(f'"AWARDDATE" <= \'{filters["award_date_end"]}\'')

        # Min/Max filters (general)
        for key in filters:
            if key.endswith("Min") and column_exists(key[:-3]):
                col = key[:-3]
                conditions.append(f"{self.quote_identifier(col)} >= {filters[key]}")
            if key.endswith("Max") and column_exists(key[:-3]):
                col = key[:-3]
                conditions.append(f"{self.quote_identifier(col)} <= {filters[key]}")

        # List filters (for actual database columns)
        excluded_keys = [
            "contract_type",
            "has_execution_data",
            "min_award_amount",
            "max_award_amount",
            "agency",
            "naics_code",
            "awardee",
            "award_date_start",
            "award_date_end",
            "psc_code",
            "award_id",
        ]
        for key in filters:
            if (
                key not in excluded_keys
                and isinstance(filters[key], list)
                and len(filters[key]) > 0
                and column_exists(key)
            ):
                value_list = "'" + "','".join([str(v).replace("'", "''") for v in filters[key]]) + "'"
                conditions.append(f"{self.quote_identifier(key)} IN ({value_list})")

        # Data availability filters
        if filters.get("dataAvailability") and isinstance(filters["dataAvailability"], list):
            data_avail_conditions = []
            for field in filters["dataAvailability"]:
                if column_exists(field):
                    data_avail_conditions.append(
                        f"{self.quote_identifier(field)} IS NOT NULL AND {self.quote_identifier(field)} <> ''"
                    )
            if data_avail_conditions:
                conditions.append(f"({f' {operator} '.join(data_avail_conditions)})")

        # Exact value filters
        if filters.get("exact_values") and isinstance(filters["exact_values"], dict):
            for field, filter_obj in filters["exact_values"].items():
                if column_exists(field):
                    if isinstance(filter_obj, dict) and "operator" in filter_obj:
                        op = filter_obj.get("operator", "=")
                        val = filter_obj.get("value", "")
                        if op in ["=", "!=", ">", "<", ">=", "<="]:
                            if isinstance(val, (int, float)):
                                conditions.append(f"{self.quote_identifier(field)} {op} {val}")
                            else:
                                val_str = str(val).replace("'", "''")
                                conditions.append(f"{self.quote_identifier(field)} {op} '{val_str}'")
                        elif op == "CONTAINS":
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{self.quote_identifier(field)} ILIKE '%{val_str}%'")
                        elif op == "STARTS_WITH":
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{self.quote_identifier(field)} ILIKE '{val_str}%'")
                        elif op == "ENDS_WITH":
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{self.quote_identifier(field)} ILIKE '%{val_str}'")
                    else:
                        val = filter_obj
                        if isinstance(val, (int, float)):
                            conditions.append(f"{self.quote_identifier(field)} = {val}")
                        else:
                            val_str = str(val).replace("'", "''")
                            conditions.append(f"{self.quote_identifier(field)} = '{val_str}'")

        return f" {operator} ".join(conditions) if conditions else ""

    def build_search_clause(self, keywords: str, column_names: Optional[List[str]] = None) -> str:
        """Build search clause for text search across columns"""
        if not keywords or keywords.strip() == "":
            return ""
        search_terms = [term.strip() for term in keywords.split(",") if term.strip()]
        if not search_terms:
            return ""
        if not column_names:
            return ""

        # Get text columns (exclude non-searchable ones)
        text_columns = [col for col in column_names if not self.is_non_searchable_column(col)]
        if not text_columns:
            logger.warning(f"No text-searchable columns found among: {column_names}")
            return ""

        all_conditions = []
        for term in search_terms:
            clean_term = term.replace("'", "''")
            # Handle exclusion (terms starting with -)
            exclude_term = clean_term.startswith("-")
            if exclude_term:
                clean_term = clean_term[1:]
                if not clean_term:
                    continue
                column_conditions = [
                    f"{self.quote_identifier(col)} NOT ILIKE '%{clean_term}%'" for col in text_columns
                ]
                all_conditions.append(" AND ".join(column_conditions))
            else:
                column_conditions = [
                    f"{self.quote_identifier(col)} ILIKE '%{clean_term}%'" for col in text_columns
                ]
                all_conditions.append("(" + " OR ".join(column_conditions) + ")")

        return " AND ".join(all_conditions) if all_conditions else ""


class DoDBudgetIntelligence:
    """DoD Budget Intelligence and Analytics Service"""

    def __init__(self, snowflake_config: Optional[Dict[str, str]] = None):
        """
        Initialize the budget intelligence service

        Args:
            snowflake_config: Snowflake connection configuration (deprecated - uses pool now)
        """
        # Config no longer needed - connection pool handles this
        self.unified_table = "FOUNDRY.BUDGET.UNIFIED"
        self.p40_table = "FOUNDRY.BUDGET.P40"

    def connect(self) -> bool:
        """
        Check connection pool availability

        Note: This method is kept for backward compatibility. Individual connections are managed by the connection pool.
        """
        if snowflake.connector is None:
            logger.error(
                "Snowflake connector not available. Install with: pip install snowflake-connector-python"
            )
            return False
        try:
            # Test connection pool
            pool = get_connection_pool()
            with pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
            logger.info("Connection pool is available")
            return True
        except Exception as e:
            logger.error(f"Connection pool test failed: {e}")
            return False

    def execute_query(self, query: str, params: Optional[Dict] = None) -> pd.DataFrame:
        """Execute SQL query using connection pool"""
        try:
            pool = get_connection_pool()
            with pool.get_connection() as connection:
                cursor = connection.cursor()
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                # Fetch results and convert to DataFrame
                results = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]
                df = pd.DataFrame(results, columns=columns)
                cursor.close()
                return df
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            return pd.DataFrame()

    def close_connection(self):
        """
        Close connection method for backward compatibility

        Note: Connection pool handles connection lifecycle automatically
        """
        pass

    def get_budget_programs_summary(self) -> dict:
        """Get summary statistics for budget programs with real utilization rates"""
        # Main budget summary query - handle FY2025 specially
        budget_query = f"""
        WITH all_data AS (
            -- FY2025: Include both Total and Enacted phases
            SELECT *, 1 as data_source
            FROM {self.unified_table}
            WHERE FISCAL_YEAR = 2025 AND PHASE IN ('Total', 'Enacted')
            UNION ALL
            -- Other years: Use only Total phase
            SELECT *, 2 as data_source
            FROM {self.unified_table}
            WHERE FISCAL_YEAR != 2025 AND PHASE = 'Total'
        ),
        phase_prioritized AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                       ORDER BY CASE WHEN PHASE = 'Total' THEN 1 WHEN PHASE = 'Enacted' THEN 2 ELSE 3 END
                   ) as phase_rank
            FROM all_data
            WHERE FISCAL_YEAR = 2025
            UNION ALL
            SELECT *, 1 as phase_rank FROM all_data WHERE FISCAL_YEAR != 2025
        )
        SELECT
            SUM(AMOUNT_K) * 1000 as total_budget,
            COUNT(DISTINCT ELEMENT_CODE) as total_programs,
            COUNT(DISTINCT APPROPRIATION_TYPE) as total_organizations,
            COUNT(DISTINCT
                CASE
                    WHEN APPROPRIATION_TYPE LIKE '%R1_RDT%' THEN 'R&D'
                    WHEN APPROPRIATION_TYPE LIKE '%P1_Procurement%' THEN 'Procurement'
                    WHEN APPROPRIATION_TYPE LIKE '%O1_OpMaint%' THEN 'Operations'
                    WHEN APPROPRIATION_TYPE LIKE '%M1_MilCon%' THEN 'Military Construction'
                    ELSE 'Other'
                END
            ) as total_categories,
            COUNT(DISTINCT CASE WHEN ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0' THEN ELEMENT_CODE END) as contract_linkable_programs,
            COUNT(DISTINCT CASE WHEN APPROPRIATION_TYPE LIKE '%R1_%' THEN ELEMENT_CODE END) as pe_programs,
            COUNT(DISTINCT CASE WHEN APPROPRIATION_TYPE LIKE '%P1_%' THEN ELEMENT_CODE END) as bli_programs,
            COUNT(DISTINCT CASE WHEN APPROPRIATION_TYPE LIKE '%P1_%' THEN ELEMENT_CODE END) as weapons_programs,
            SUM(CASE WHEN FISCAL_YEAR = 2024 THEN AMOUNT_K ELSE 0 END) * 1000 as fy_2024_total,
            SUM(CASE WHEN FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) * 1000 as fy_2025_total,
            SUM(CASE WHEN FISCAL_YEAR = 2026 THEN AMOUNT_K ELSE 0 END) * 1000 as fy_2026_total
        FROM phase_prioritized
        WHERE phase_rank = 1
        """

        # Real utilization calculation using available phases
        utilization_query = f"""
        WITH budget_execution AS (
            -- FY2025 Enacted vs Total budget analysis
            SELECT
                SUM(CASE WHEN PHASE = 'Enacted' AND FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) * 1000 as fy2025_enacted,
                SUM(CASE WHEN PHASE = 'Total' AND FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) * 1000 as fy2025_total,
                -- Historical actual execution for utilization baseline
                SUM(CASE WHEN PHASE = 'Actual' THEN AMOUNT_K ELSE 0 END) * 1000 as historical_actual,
                SUM(CASE WHEN PHASE = 'Total' THEN AMOUNT_K ELSE 0 END) * 1000 as total_budget_all_years
            FROM {self.unified_table}
            WHERE PHASE IN ('Enacted', 'Actual', 'Total')
        )
        SELECT
            fy2025_enacted,
            fy2025_total,
            historical_actual,
            total_budget_all_years,
            -- Calculate real budget utilization: Authorized ÷ Total Available
            CASE
                WHEN total_budget_all_years > 0 AND fy2025_enacted > 0 THEN ROUND(CAST(fy2025_enacted AS FLOAT) / CAST(total_budget_all_years AS FLOAT), 3)
                -- Fallback: Historical execution rate
                WHEN total_budget_all_years > 0 AND historical_actual > 0 THEN ROUND(CAST(historical_actual AS FLOAT) / CAST(total_budget_all_years AS FLOAT), 3)
                ELSE NULL -- No fallback - return NULL if real data unavailable
            END as real_utilization_rate
        FROM budget_execution
        """

        try:
            # Execute budget summary query
            result_df = self.execute_query(budget_query)
            if result_df.empty:
                return {}

            # Execute utilization query
            utilization_df = self.execute_query(utilization_query)

            # Get real utilization rate or fallback to calculation
            real_utilization_rate = 0.0
            total_obligated = 0
            if not utilization_df.empty:
                # No fallback values - use only real data or None
                raw_utilization = utilization_df.iloc[0]["REAL_UTILIZATION_RATE"]
                real_utilization_rate = float(raw_utilization) if raw_utilization is not None else None

                fy2025_enacted = float(utilization_df.iloc[0]["FY2025_ENACTED"] or 0)
                historical_actual = float(utilization_df.iloc[0]["HISTORICAL_ACTUAL"] or 0)

                # Use Enacted as obligated amount (most accurate for current authorization)
                if fy2025_enacted > 0:
                    total_obligated = fy2025_enacted
                    logger.info(f"Using FY2025 Enacted as obligated: ${total_obligated:,.0f}")
                elif historical_actual > 0:
                    total_obligated = historical_actual
                    logger.info(f"Using historical actual as obligated: ${total_obligated:,.0f}")
                else:
                    # Only calculate if we have a real utilization rate
                    if real_utilization_rate is not None:
                        total_budget = float(result_df.iloc[0]["TOTAL_BUDGET"])
                        total_obligated = total_budget * real_utilization_rate
                        logger.info(f"Calculated obligated: ${total_obligated:,.0f}")
                    else:
                        total_obligated = None
                        logger.info("No real utilization rate available - total_obligated set to None")

                if real_utilization_rate is not None:
                    logger.info(f"Real utilization rate: {real_utilization_rate:.1%}")
                else:
                    logger.info("Real utilization rate: None (no real data available)")
            else:
                # No fallback - real data only
                logger.warning("No utilization data found - returning None for utilization metrics")
                real_utilization_rate = None
                total_obligated = None

            return {
                "total_budget": float(result_df.iloc[0]["TOTAL_BUDGET"]),
                "total_programs": int(result_df.iloc[0]["TOTAL_PROGRAMS"]),
                "total_organizations": int(result_df.iloc[0]["TOTAL_ORGANIZATIONS"]),
                "total_categories": int(result_df.iloc[0]["TOTAL_CATEGORIES"]),
                "contract_linkable_programs": int(
                    result_df.iloc[0]["CONTRACT_LINKABLE_PROGRAMS"]
                ),
                "pe_programs": int(result_df.iloc[0]["PE_PROGRAMS"]),
                "bli_programs": int(result_df.iloc[0]["BLI_PROGRAMS"]),
                "weapons_programs": int(result_df.iloc[0]["WEAPONS_PROGRAMS"]),
                "fy_2024_total": float(result_df.iloc[0]["FY_2024_TOTAL"]),
                "fy_2025_total": float(result_df.iloc[0]["FY_2025_TOTAL"]),
                "fy_2026_total": float(result_df.iloc[0]["FY_2026_TOTAL"]),
                # Add real utilization data (None if not available)
                "real_utilization_rate": real_utilization_rate,
                "total_obligated": int(total_obligated) if total_obligated is not None else None,
            }
        except Exception as e:
            logger.error(f"Error getting budget programs summary: {e}")
            return {}

    def get_account_shifts_analysis(self) -> pd.DataFrame:
        """Analyze budget shifts between FY2025 and FY2026 by organization/branch"""
        # Debug: Check what organizations actually exist
        debug_query = f"""
        SELECT DISTINCT 
            COALESCE(ORGANIZATION, 'DoD') as ORGANIZATION,
            COUNT(*) as record_count,
            SUM(CASE WHEN FISCAL_YEAR = 2025 THEN AMOUNT_K ELSE 0 END) as fy2025_total,
            SUM(CASE WHEN FISCAL_YEAR = 2026 THEN AMOUNT_K ELSE 0 END) as fy2026_total
        FROM {self.unified_table}
        WHERE PHASE = 'Total' AND FISCAL_YEAR IN (2025, 2026)
        GROUP BY COALESCE(ORGANIZATION, 'DoD')
        ORDER BY fy2025_total DESC
        """

        debug_result = self.execute_query(debug_query)
        if not debug_result.empty:
            logger.info("=== ORGANIZATION DEBUG INFO ===")
            for _, row in debug_result.iterrows():
                org = row['ORGANIZATION']
                count = row['RECORD_COUNT']
                fy2025 = row['FY2025_TOTAL']
                fy2026 = row['FY2026_TOTAL']
                logger.info(f"Org: {org} | Records: {count} | FY2025: ${fy2025:,.0f}K | FY2026: ${fy2026:,.0f}K")

        query = f"""
        WITH yearly_budget AS (
            SELECT 
                COALESCE(ORGANIZATION, 'DoD') as ORGANIZATION,
                FISCAL_YEAR,
                SUM(AMOUNT_K) * 1000 as TOTAL_BUDGET
            FROM {self.unified_table}
            WHERE PHASE = 'Total' AND FISCAL_YEAR IN (2025, 2026)
              AND COALESCE(ORGANIZATION, 'DoD') IN ('A', 'N', 'F', 'M', 'S', 'DoD')  -- Include Marines & Space Force if they exist
            GROUP BY COALESCE(ORGANIZATION, 'DoD'), FISCAL_YEAR
        ),
        budget_comparison AS (
            SELECT 
                ORGANIZATION,
                SUM(CASE WHEN FISCAL_YEAR = 2025 THEN TOTAL_BUDGET ELSE 0 END) as FY2025_BUDGET,
                SUM(CASE WHEN FISCAL_YEAR = 2026 THEN TOTAL_BUDGET ELSE 0 END) as FY2026_BUDGET
            FROM yearly_budget
            GROUP BY ORGANIZATION
            HAVING 
                SUM(CASE WHEN FISCAL_YEAR = 2025 THEN TOTAL_BUDGET ELSE 0 END) > 0 OR
                SUM(CASE WHEN FISCAL_YEAR = 2026 THEN TOTAL_BUDGET ELSE 0 END) > 0
        )
        SELECT 
            ORGANIZATION as branch,
            COALESCE(FY2025_BUDGET, 0) as fy2025_budget,
            COALESCE(FY2026_BUDGET, 0) as fy2026_budget,
            (COALESCE(FY2026_BUDGET, 0) - COALESCE(FY2025_BUDGET, 0)) as budget_change,
            CASE WHEN COALESCE(FY2025_BUDGET, 0) > 0 THEN ROUND(((COALESCE(FY2026_BUDGET, 0) - COALESCE(FY2025_BUDGET, 0)) / FY2025_BUDGET) * 100, 1) ELSE 0.0 END as change_percent,
            CASE
                WHEN ORGANIZATION = 'A' THEN 'ARMY'
                WHEN ORGANIZATION = 'N' THEN 'NAVY'
                WHEN ORGANIZATION = 'F' THEN 'AIR_FORCE'
                WHEN ORGANIZATION = 'M' THEN 'MARINES'
                WHEN ORGANIZATION = 'S' THEN 'SPACE_FORCE'
                WHEN ORGANIZATION = 'DoD' THEN 'DEFENSE'
                ELSE UPPER(ORGANIZATION)
            END as branch_display_name
        FROM budget_comparison
        WHERE ORGANIZATION IN ('A', 'N', 'F', 'M', 'S', 'DoD')  -- Ensure only desired branches
        ORDER BY COALESCE(FY2025_BUDGET, 0) DESC
        """

        result = self.execute_query(query)
        logger.info(f"Account shifts query returned {len(result)} rows")

        # Normalize column names to lowercase for consistent API response
        result.columns = result.columns.str.lower()

        if not result.empty:
            logger.info("=== ACCOUNT SHIFTS RESULTS ===")
            # Log the actual column names for debugging
            logger.info(f"Result columns: {list(result.columns)}")
            for _, row in result.iterrows():
                # Handle both uppercase and lowercase column names
                branch = row.get('branch', row.get('BRANCH', 'Unknown'))
                branch_display = row.get('branch_display_name', row.get('BRANCH_DISPLAY_NAME', 'Unknown'))
                fy2025 = row.get('fy2025_budget', row.get('FY2025_BUDGET', 0))
                fy2026 = row.get('fy2026_budget', row.get('FY2026_BUDGET', 0))
                change_pct = row.get('change_percent', row.get('CHANGE_PERCENT', 0))
                logger.info(f"Branch: {branch} | Display: {branch_display} | FY2025: ${fy2025:,.0f} | FY2026: ${fy2026:,.0f} | Change: {change_pct}%")

        return result

    def get_budget_execution_trends(
        self,
        organization: Optional[str] = None,
        category: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        min_budget: Optional[float] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict:
        """Get budget authorization trends showing Total vs Enacted budget comparison"""
        # Smart fiscal year logic: default to 2025 for most complete data
        if not fiscal_year:
            fiscal_year = 2025

        # Build filters
        where_conditions = [f"FISCAL_YEAR = {fiscal_year}"]

        # Organization filter
        if organization and organization != "All Agencies":
            org_mapping = {
                "Navy": "N",
                "Air Force": "F",
                "Army": "A",
                "N": "N",
                "F": "F",
                "A": "A",
                "DoD": "DoD"
            }
            actual_org = org_mapping.get(organization, organization)
            where_conditions.append(f"COALESCE(ORGANIZATION, 'DoD') = '{actual_org}'")

        # Category filter
        if category and category != "All Categories":
            category_patterns = {
                "R&D": "R1_%",
                "Procurement": "P1_%",
                "Operations": "O1_%",
                "Military Construction": "M1_%"
            }
            pattern = category_patterns.get(category, category)
            where_conditions.append(f"APPROPRIATION_TYPE LIKE '{pattern}'")

        where_clause = " AND ".join(where_conditions)

        query = f"""
        WITH phase_data AS (
            SELECT 
                ELEMENT_CODE, ELEMENT_TITLE, APPROPRIATION_TYPE, COALESCE(ORGANIZATION, 'DoD') as ORGANIZATION, PHASE,
                SUM(AMOUNT_K) * 1000 as AMOUNT_DOLLARS
            FROM {self.unified_table}
            WHERE {where_clause}
              AND ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0'
              AND PHASE IN ('Enacted', 'Total', 'Supplemental', 'Supp')
            GROUP BY ELEMENT_CODE, ELEMENT_TITLE, APPROPRIATION_TYPE, ORGANIZATION, PHASE
        ),
        program_authorization AS (
            SELECT
                pd.ELEMENT_CODE, pd.ELEMENT_TITLE, pd.APPROPRIATION_TYPE, pd.ORGANIZATION,
                SUM(CASE WHEN pd.PHASE = 'Enacted' THEN pd.AMOUNT_DOLLARS ELSE 0 END) as ENACTED_AMOUNT,
                SUM(CASE WHEN pd.PHASE = 'Total' THEN pd.AMOUNT_DOLLARS ELSE 0 END) as TOTAL_AMOUNT,
                SUM(CASE WHEN pd.PHASE IN ('Supplemental', 'Supp') THEN pd.AMOUNT_DOLLARS ELSE 0 END) as SUPPLEMENTAL_AMOUNT,
                COUNT(DISTINCT pd.PHASE) as PHASE_COUNT
            FROM phase_data pd
            GROUP BY pd.ELEMENT_CODE, pd.ELEMENT_TITLE, pd.APPROPRIATION_TYPE, pd.ORGANIZATION
        ),
        authorization_analysis AS (
            SELECT *,
                -- Use Enacted as primary budget if available, else Total
                CASE WHEN ENACTED_AMOUNT > 0 THEN ENACTED_AMOUNT ELSE TOTAL_AMOUNT END as BUDGET_AMOUNT,
                -- Calculate authorization variance (Enacted vs Total)
                CASE WHEN TOTAL_AMOUNT > 0 AND ENACTED_AMOUNT > 0 THEN ((ENACTED_AMOUNT - TOTAL_AMOUNT) / TOTAL_AMOUNT) * 100 ELSE NULL END as AUTHORIZATION_VARIANCE_PCT,
                -- Calculate total authorized (including supplemental)
                (COALESCE(ENACTED_AMOUNT, TOTAL_AMOUNT) + SUPPLEMENTAL_AMOUNT) as TOTAL_AUTHORIZED,
                ROW_NUMBER() OVER (ORDER BY CASE WHEN ENACTED_AMOUNT > 0 THEN ENACTED_AMOUNT ELSE TOTAL_AMOUNT END DESC ) as ROW_NUM
            FROM program_authorization
            WHERE (ENACTED_AMOUNT > 0 OR TOTAL_AMOUNT > 0) -- Only programs with budget data
        ),
        final_analysis AS (
            SELECT aa.*,
                -- Calculate authorization rate (how much of Total was Enacted)
                CASE WHEN TOTAL_AMOUNT > 0 AND ENACTED_AMOUNT > 0 THEN (ENACTED_AMOUNT / TOTAL_AMOUNT) * 100 ELSE 100 -- If only one phase, assume 100% authorized
                END as AUTHORIZATION_RATE_PCT,
                -- Calculate program category for trend grouping
                CASE
                    WHEN aa.APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                    WHEN aa.APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                    WHEN aa.APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                    WHEN aa.APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                    ELSE 'Other'
                END as CATEGORY
            FROM authorization_analysis aa
        )
        SELECT
            ELEMENT_CODE as identifier,
            ELEMENT_TITLE as program_name,
            CATEGORY as category,
            ORGANIZATION as organization,
            BUDGET_AMOUNT as budget_amount,
            0 as spent_amount, -- No spending data available
            BUDGET_AMOUNT as remaining_amount, -- All budget remains (no spending data)
            AUTHORIZATION_RATE_PCT as execution_rate, -- Reuse field for authorization rate
            AUTHORIZATION_VARIANCE_PCT as variance_rate,
            0 as requested_amount, -- No request data available
            ENACTED_AMOUNT as enacted_amount,
            0 as actual_amount, -- No actual spending data
            0 as reconciliation_amount, -- No reconciliation data
            TOTAL_AMOUNT as total_program_amount,
            SUPPLEMENTAL_AMOUNT as supplemental_amount,
            TOTAL_AUTHORIZED as total_authorized_amount,
            PHASE_COUNT as phases_available,
            TRUE as contract_linkable
        FROM final_analysis
        WHERE ROW_NUM > {offset} AND ROW_NUM <= {offset + limit}
        ORDER BY BUDGET_AMOUNT DESC
        """

        # Summary query for totals
        summary_query = f"""
        WITH phase_data AS (
            SELECT PHASE, SUM(AMOUNT_K) * 1000 as AMOUNT_DOLLARS
            FROM {self.unified_table}
            WHERE {where_clause}
              AND ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0'
              AND PHASE IN ('Enacted', 'Total', 'Supplemental', 'Supp')
            GROUP BY PHASE
        )
        SELECT
            0 as total_requested, -- No request data available
            SUM(CASE WHEN PHASE = 'Enacted' THEN AMOUNT_DOLLARS ELSE 0 END) as total_enacted,
            SUM(CASE WHEN PHASE = 'Total' THEN AMOUNT_DOLLARS ELSE 0 END) as total_budget,
            0 as total_actual, -- No actual spending data
            0 as total_reconciliation, -- No reconciliation data
            SUM(CASE WHEN PHASE IN ('Supplemental', 'Supp') THEN AMOUNT_DOLLARS ELSE 0 END) as total_supplemental
        FROM phase_data
        """

        try:
            # Get program data
            result_df = self.execute_query(query)
            summary_df = self.execute_query(summary_query)

            if result_df.empty:
                return {"data": [], "total": 0, "summary": {}}

            # Convert column names to lowercase
            result_df.columns = result_df.columns.str.lower()
            summary_df.columns = summary_df.columns.str.lower()

            # Get total count
            count_query = f"""
            SELECT COUNT(DISTINCT ELEMENT_CODE) as total_programs
            FROM {self.unified_table}
            WHERE {where_clause}
              AND ELEMENT_CODE IS NOT NULL AND ELEMENT_CODE != '0'
              AND PHASE IN ('Requested', 'Enacted', 'Total', 'Actual', 'Reconciliation')
            """
            count_df = self.execute_query(count_query)
            total_count = int(count_df.iloc[0]['TOTAL_PROGRAMS']) if not count_df.empty else 0

            # Process results
            for i, (idx, row) in enumerate(result_df.iterrows()):
                # Add program ID for frontend
                result_df.at[idx, "id"] = f"trend_{i + 1}"
                # Ensure all financial amounts and rates are floats
                financial_cols = ['budget_amount', 'spent_amount', 'remaining_amount', 'requested_amount', 'enacted_amount', 'actual_amount', 'reconciliation_amount']
                rate_cols = ['execution_rate', 'variance_rate']
                for col in financial_cols:
                    if col in result_df.columns:
                        result_df.at[idx, col] = float(row.get(col, 0) or 0)
                for col in rate_cols:
                    if col in result_df.columns:
                        result_df.at[idx, col] = float(row.get(col, 0) or 0)

            # Prepare summary
            summary = {}
            if not summary_df.empty:
                summary_row = summary_df.iloc[0]
                # Use enacted as primary budget if available, else total budget
                total_enacted = float(summary_row.get('total_enacted', 0) or 0)
                total_budget = float(summary_row.get('total_budget', 0) or 0)
                total_supplemental = float(summary_row.get('total_supplemental', 0) or 0)
                # Primary authorization amount (prefer enacted over total)
                primary_authorization = max(total_enacted, total_budget)
                total_authorized = primary_authorization + total_supplemental
                # Authorization rate (how much of total was enacted)
                authorization_rate = (total_enacted / total_budget * 100) if total_budget > 0 and total_enacted > 0 else 100
                summary = {
                    "total_requested": 0,  # No request data available
                    "total_enacted": total_enacted,
                    "total_budget": primary_authorization,
                    "total_spent": 0,  # No spending data available
                    "total_remaining": primary_authorization,  # All budget remains (no spending data)
                    "total_supplemental": total_supplemental,
                    "total_authorized": total_authorized,
                    "overall_execution_rate": authorization_rate,  # Repurpose as authorization rate
                    "data_note": "Authorization data only - no spending/execution data available",
                    "total_programs": total_count
                }

            return {
                "data": result_df.to_dict('records') if not result_df.empty else [],
                "total": total_count,
                "summary": summary
            }
        except Exception as e:
            logger.error(f"Error getting budget execution trends: {e}")
            return {"data": [], "total": 0, "summary": {}}

    def get_budget_programs(
        self,
        organization: Optional[str] = None,
        category: Optional[str] = None,
        weapons_category: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        min_budget: Optional[float] = None,
        search_query: Optional[str] = None,
        sort_by: str = "primary_budget_amount",
        sort_order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> dict:
        """Get individual budget programs with filtering and pagination"""
        # Smart fiscal year logic: use both 2025 and 2026 by default, or specific year if requested
        if fiscal_year:
            fiscal_years = [fiscal_year]
        else:
            # Use both years to capture all data (operations/R&D in 2025, procurement in 2026)
            fiscal_years = [2025, 2026]

        # Build base query conditions with fiscal year specific phase logic
        if fiscal_year == 2025:
            # FY2025: Include both Total and Enacted phases (procurement data is in Enacted)
            phase_condition = "PHASE IN ('Total', 'Enacted')"
        else:
            # FY2026 and others: Use only Total phase (original working logic)
            phase_condition = "PHASE = 'Total'"

        where_conditions = [
            phase_condition,
            f"FISCAL_YEAR IN ({', '.join(map(str, fiscal_years))})"
        ]

        # Organization filter (use ORGANIZATION column, not APPROPRIATION_TYPE)
        if organization and organization != "All Agencies":
            # The database stores organizations as single letters (N, F, A) or DoD
            # Handle both full names and abbreviations
            org_mapping = {
                "Navy": "N",
                "Air Force": "F",
                "Army": "A",
                "N": "N",
                "F": "F",
                "A": "A",  # Keep abbreviations as-is
                "DoD": "DoD"
            }
            # Map to database format (single letters)
            actual_org = org_mapping.get(organization, organization)
            where_conditions.append(f"COALESCE(ORGANIZATION, 'DoD') = '{actual_org}'")

        # Category filter (use proper appropriation type patterns)
        if category and category != "All Categories":
            category_patterns = {
                "R&D": "R1_%",
                "Procurement": "P1_%",
                "Operations": "O1_%",
                "Military Construction": "M1_%"
            }
            pattern = category_patterns.get(category, category)
            where_conditions.append(f"APPROPRIATION_TYPE LIKE '{pattern}'")

        # Budget filter
        if min_budget and min_budget > 0:
            # Convert millions to thousands (data is stored in K)
            min_budget_k = min_budget * 1000
            where_conditions.append(f"AMOUNT_K >= {min_budget_k}")

        # Search query filter
        if search_query and search_query.strip():
            search_term = search_query.strip()
            search_condition = f"""(
                ELEMENT_TITLE ILIKE '%{search_term}%'
                OR ELEMENT_CODE ILIKE '%{search_term}%'
                OR ORGANIZATION ILIKE '%{search_term}%'
            )"""
            where_conditions.append(search_condition)

        where_clause = " AND ".join(where_conditions)

        # Map sort fields
        sort_field_mapping = {
            "primary_budget_amount": "AMOUNT_K",
            "program_name": "ELEMENT_TITLE",
            "organization": "ORGANIZATION",
            "fiscal_year": "FISCAL_YEAR",
            "category": "APPROPRIATION_TYPE"
        }
        sort_field = sort_field_mapping.get(sort_by, "AMOUNT_K")

        # Use different query logic based on fiscal year
        if fiscal_year == 2025:
            # FY2025: Use phase prioritization to handle mixed phases
            query = f"""
            WITH phase_prioritized AS (
                SELECT *,
                    ROW_NUMBER() OVER (
                        PARTITION BY ELEMENT_CODE, FISCAL_YEAR, APPROPRIATION_TYPE
                        ORDER BY CASE WHEN PHASE = 'Total' THEN 1 WHEN PHASE = 'Enacted' THEN 2 ELSE 3 END
                    ) as phase_rank
                FROM {self.unified_table}
                WHERE {where_clause}
            ),
            program_data AS (
                SELECT
                    ROW_NUMBER() OVER (ORDER BY {sort_field} {sort_order.upper()}) as row_num,
                    ELEMENT_CODE as identifier,
                    ELEMENT_TITLE as program_name,
                    APPROPRIATION_TYPE,
                    ACCOUNT_CODE,
                    AMOUNT_K as primary_budget_amount,
                    FISCAL_YEAR,
                    PHASE,
                    CASE
                        WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                        WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                        WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                        WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                        ELSE 'Other'
                    END as category,
                    CASE
                        WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R1'
                        WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'P1'
                        WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'O1'
                        WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'M1'
                        ELSE 'OTHER'
                    END as identifier_type,
                    COALESCE(ORGANIZATION, 'DoD') as organization,
                    TRUE as contract_linkable
                FROM phase_prioritized
                WHERE phase_rank = 1
            ),
            """
        else:
            # FY2026 and others: Use simple original logic (PHASE = 'Total' only)
            query = f"""
            WITH program_data AS (
                SELECT
                    ROW_NUMBER() OVER (ORDER BY {sort_field} {sort_order.upper()}) as row_num,
                    ELEMENT_CODE as identifier,
                    ELEMENT_TITLE as program_name,
                    APPROPRIATION_TYPE,
                    ACCOUNT_CODE,
                    AMOUNT_K as primary_budget_amount,
                    FISCAL_YEAR,
                    PHASE,
                    CASE
                        WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R&D'
                        WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'Procurement'
                        WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'Operations'
                        WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'Military Construction'
                        ELSE 'Other'
                    END as category,
                    CASE
                        WHEN APPROPRIATION_TYPE LIKE 'R1_%' THEN 'R1'
                        WHEN APPROPRIATION_TYPE LIKE 'P1_%' THEN 'P1'
                        WHEN APPROPRIATION_TYPE LIKE 'O1_%' THEN 'O1'
                        WHEN APPROPRIATION_TYPE LIKE 'M1_%' THEN 'M1'
                        ELSE 'OTHER'
                    END as identifier_type,
                    COALESCE(ORGANIZATION, 'DoD') as organization,
                    TRUE as contract_linkable
                FROM {self.unified_table}
                WHERE {where_clause}
            ),
            """

        # Complete the query with common parts
        query += f"""
        total_count AS (
            SELECT COUNT(DISTINCT identifier) as total FROM program_data
        )
        SELECT pd.*, tc.total, CONCAT('program_', pd.row_num) as id
        FROM program_data pd
        CROSS JOIN total_count tc
        WHERE pd.row_num > {offset} AND pd.row_num <= {offset + limit}
        ORDER BY pd.row_num
        """

        try:
            result_df = self.execute_query(query)
            if result_df.empty:
                return {"data": result_df, "total": 0}

            # Convert column names to lowercase for consistency
            result_df.columns = result_df.columns.str.lower()

            # Get total count
            total = (
                int(result_df.iloc[0]["total"])
                if len(result_df) > 0 and "total" in result_df.columns
                else 0
            )

            # Convert data types and add missing fields
            for idx, row in result_df.iterrows():
                # Handle potential null values and convert K to actual dollars
                primary_budget_k = row.get("primary_budget_amount", 0) or 0
                try:
                    primary_budget_actual = float(primary_budget_k) * 1000 if primary_budget_k else 0
                except (ValueError, TypeError):
                    primary_budget_actual = 0
                result_df.at[idx, "primary_budget_amount"] = primary_budget_actual

                # Set fiscal year budgets based on actual fiscal year
                fy = row.get("fiscal_year", 2025)
                result_df.at[idx, "fy_2024_budget"] = 0  # Not available in our dataset
                result_df.at[idx, "fy_2025_budget"] = primary_budget_actual if fy == 2025 else 0
                result_df.at[idx, "fy_2026_budget"] = primary_budget_actual if fy == 2026 else 0

            return {"data": result_df, "total": total}
        except Exception as e:
            logger.error(f"Error getting budget programs: {e}")
            return {"data": pd.DataFrame(), "total": 0}

    def get_top_programs(self, limit: int = 20, fiscal_year: Optional[int] = None) -> pd.DataFrame:
        """Get top funded programs for a fiscal year"""
        try:
            fy_filter = f"AND FISCAL_YEAR = {fiscal_year}" if fiscal_year else ""
            query = f"""
            SELECT
                APPROPRIATION_TYPE, ELEMENT_TITLE, ELEMENT_CODE, ORGANIZATION,
                AMOUNT_K as TOTAL_FUNDING_K, FISCAL_YEAR
            FROM {self.unified_table}
            WHERE PHASE = 'Total' {fy_filter}
            ORDER BY AMOUNT_K DESC
            LIMIT {limit}
            """
            return self.execute_query(query)
        except Exception as e:
            logger.error(f"Error in get_top_programs: {e}")
            return pd.DataFrame()

    def get_budget_overview(self, fiscal_years: Optional[List[int]] = None) -> pd.DataFrame:
        """Get budget overview for specified fiscal years"""
        try:
            if not fiscal_years:
                fiscal_years = [2025]
            fy_list = ",".join(map(str, fiscal_years))
            query = f"""
            SELECT
                APPROPRIATION_TYPE, PHASE,
                SUM(AMOUNT_K) as TOTAL_AMOUNT_K,
                COUNT(DISTINCT ELEMENT_CODE) as PROGRAM_COUNT
            FROM {self.unified_table}
            WHERE FISCAL_YEAR IN ({fy_list})
            GROUP BY APPROPRIATION_TYPE, PHASE
            ORDER BY APPROPRIATION_TYPE, PHASE
            """
            return self.execute_query(query)
        except Exception as e:
            logger.error(f"Error in get_budget_overview: {e}")
            return pd.DataFrame()

    def get_programs_by_category(self, fiscal_year: int = None) -> pd.DataFrame:
        """Get programs grouped by category"""
        # Determine fiscal year filter
        if fiscal_year:
            year_filter = f"FISCAL_YEAR = {fiscal_year}"
        else:
            year_filter = "FISCAL_YEAR IN (2025, 2026)"

        # Debug: Check all appropriation types and phases for the selected fiscal year
        debug_query = f"""
        SELECT DISTINCT APPROPRIATION_TYPE, PHASE, COUNT(*) as record_count, SUM(AMOUNT_K) as total_amount_k
        FROM {self.unified_table}
        WHERE {year_filter}
        GROUP BY APPROPRIATION_TYPE, PHASE
        ORDER BY total_amount_k DESC
        """
        logger.info(f"[DEBUG] Getting appropriation types and phases for fiscal year filter: {year_filter}")
        debug_result = self.execute_query(debug_query)
        if not debug_result.empty:
            logger.info(f"[DEBUG] Found {len(debug_result)} appropriation/phase combinations:")
            milcon_total = 0
            for _, row in debug_result.iterrows():
                approp_type = row['APPROPRIATION_TYPE']
                phase = row['PHASE']
                amount = row['TOTAL_AMOUNT_K']
                logger.info(f" - {approp_type} ({phase}): {row['RECORD_COUNT']} records, ${amount:,.0f}K")
                # Track Military Construction specifically
                if any(pattern in approp_type.upper() for pattern in ['M1_', 'MILCON', 'MILITARY', 'CONSTRUCTION']):
                    milcon_total += amount
                    logger.info(f" ^^^ MILITARY CONSTRUCTION DETECTED: ${amount:,.0f}K")
            logger.info(f"[DEBUG] Total Military Construction found across all phases: ${milcon_total:,.0f}K")

        # Use flexible phase logic: prefer Total, but include other phases as needed
        # This approach avoids complex deduplication that might be causing data loss
        query = f"""
        WITH phase_prioritized AS (
            SELECT
                APPROPRIATION_TYPE, ELEMENT_CODE, AMOUNT_K, PHASE,
                -- Use the best available phase for each appropriation type
                CASE
                    WHEN APPROPRIATION_TYPE LIKE '%P1_%' AND PHASE = 'Enacted' THEN 1  -- Procurement prefers Enacted
                    WHEN PHASE = 'Total' THEN 2  -- Most data prefers Total
                    WHEN PHASE = 'Enacted' THEN 3  -- Fallback to Enacted
                    WHEN PHASE = 'Disc' THEN 4  -- Include Disc phase
                    ELSE 5  -- Other phases
                END as phase_priority
            FROM {self.unified_table}
            WHERE {year_filter}
              AND PHASE IN ('Total', 'Enacted', 'Disc')  -- Include main budget phases
        ),
        best_data AS (
            SELECT APPROPRIATION_TYPE, ELEMENT_CODE, AMOUNT_K
            FROM phase_prioritized p1
            WHERE phase_priority = (
                SELECT MIN(phase_priority)
                FROM phase_prioritized p2
                WHERE p1.APPROPRIATION_TYPE = p2.APPROPRIATION_TYPE
                  AND p1.ELEMENT_CODE = p2.ELEMENT_CODE
            )
        )
        SELECT
            CASE
                WHEN APPROPRIATION_TYPE LIKE '%R1_%' OR APPROPRIATION_TYPE = 'R1_RDT&E' THEN 'R&D'
                WHEN APPROPRIATION_TYPE LIKE '%P1_%' OR APPROPRIATION_TYPE = 'P1_Procurement' THEN 'Procurement'
                WHEN APPROPRIATION_TYPE LIKE '%O1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%OPERATION%' THEN 'Operations'
                WHEN APPROPRIATION_TYPE LIKE '%M1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%MILITARY%' OR UPPER(APPROPRIATION_TYPE) LIKE '%CONSTRUCTION%' THEN 'Military Construction'
                ELSE 'Other'
            END as category,
            COUNT(DISTINCT ELEMENT_CODE) as total_programs,
            SUM(AMOUNT_K) * 1000 as total_budget,
            COUNT(DISTINCT APPROPRIATION_TYPE) as organizations_count,
            ROUND((SUM(AMOUNT_K) * 100.0 / (
                SELECT SUM(sub.AMOUNT_K) FROM best_data sub
            )), 2) as percentage_of_total
        FROM best_data
        GROUP BY
            CASE
                WHEN APPROPRIATION_TYPE LIKE '%R1_%' OR APPROPRIATION_TYPE = 'R1_RDT&E' THEN 'R&D'
                WHEN APPROPRIATION_TYPE LIKE '%P1_%' OR APPROPRIATION_TYPE = 'P1_Procurement' THEN 'Procurement'
                WHEN APPROPRIATION_TYPE LIKE '%O1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%OPERATION%' THEN 'Operations'
                WHEN APPROPRIATION_TYPE LIKE '%M1_%' OR UPPER(APPROPRIATION_TYPE) LIKE '%MILITARY%' OR UPPER(APPROPRIATION_TYPE) LIKE '%CONSTRUCTION%' THEN 'Military Construction'
                ELSE 'Other'
            END
        HAVING SUM(AMOUNT_K) > 0
        ORDER BY total_budget DESC
        """

        try:
            result = self.execute_query(query)
            if result is not None and len(result) > 0:
                # Convert column names to lowercase for frontend compatibility
                result.columns = result.columns.str.lower()
            return result
        except Exception as e:
            logger.error(f"Error getting programs by category: {e}")
            return pd.DataFrame()

    def get_programs_by_agency(self, fiscal_year: int = None) -> pd.DataFrame:
        """Get programs grouped by agency/organization"""
        try:
            fy_filter = f"AND FISCAL_YEAR = {fiscal_year}" if fiscal_year else ""
            query = f"""
            SELECT
                ORGANIZATION as agency,
                COUNT(DISTINCT ELEMENT_CODE) as program_count,
                SUM(AMOUNT_K) * 1000 as total_budget,
                AVG(AMOUNT_K) * 1000 as avg_budget
            FROM {self.unified_table}
            WHERE PHASE = 'Total' {fy_filter}
              AND ORGANIZATION IS NOT NULL
            GROUP BY ORGANIZATION
            ORDER BY total_budget DESC
            LIMIT 50
            """
            return self.execute_query(query)
        except Exception as e:
            logger.error(f"Error in get_programs_by_agency: {e}")
            return pd.DataFrame()

    def search_budget_programs(
        self,
        query: str,
        organization: Optional[str] = None,
        category: Optional[str] = None,
        weapons_category: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        min_budget: Optional[float] = None,
        limit: int = 100,
        offset: int = 0
    ) -> dict:
        """Search budget programs by name, identifier, or description"""
        # Use the get_budget_programs method with search_query parameter
        return self.get_budget_programs(
            organization=organization,
            category=category,
            weapons_category=weapons_category,
            fiscal_year=fiscal_year,
            min_budget=min_budget,
            search_query=query,
            limit=limit,
            offset=offset
        )

    def get_weapons_intelligence(self, category: Optional[str] = None, min_budget: Optional[float] = None, limit: int = 50) -> dict:
        """Get weapons systems intelligence and analysis"""
        try:
            where_conditions = ["PHASE = 'Total'", "WEAPONS_CATEGORY IS NOT NULL"]
            if category:
                where_conditions.append(f"WEAPONS_CATEGORY ILIKE '%{category}%'")
            if min_budget:
                where_conditions.append(f"AMOUNT_K >= {min_budget}")
            where_clause = " AND ".join(where_conditions)

            query = f"""
            SELECT
                WEAPONS_CATEGORY,
                ORGANIZATION,
                COUNT(DISTINCT ELEMENT_CODE) as system_count,
                SUM(AMOUNT_K) * 1000 as total_budget,
                AVG(AMOUNT_K) * 1000 as avg_budget
            FROM {self.unified_table}
            WHERE {where_clause}
            GROUP BY WEAPONS_CATEGORY, ORGANIZATION
            ORDER BY total_budget DESC
            LIMIT {limit}
            """
            result = self.execute_query(query)
            return {
                "summary": {"total_categories": len(result)} if not result.empty else {},
                "high_value_systems": result.to_dict("records") if not result.empty else [],
                "categories": result['WEAPONS_CATEGORY'].unique().tolist() if not result.empty else [],
                "organizations": result['ORGANIZATION'].unique().tolist() if not result.empty else []
            }
        except Exception as e:
            logger.error(f"Error in get_weapons_intelligence: {e}")
            return {"summary": {}, "high_value_systems": [], "categories": [], "organizations": []}

    def get_multi_year_analysis(self) -> dict:
        """Get multi-year budget analysis across fiscal years"""
        try:
            query = f"""
            SELECT
                FISCAL_YEAR, APPROPRIATION_TYPE,
                SUM(AMOUNT_K) * 1000 as total_budget,
                COUNT(DISTINCT ELEMENT_CODE) as program_count
            FROM {self.unified_table}
            WHERE PHASE = 'Total'
            GROUP BY FISCAL_YEAR, APPROPRIATION_TYPE
            ORDER BY FISCAL_YEAR, APPROPRIATION_TYPE
            """
            result = self.execute_query(query)
            if result.empty:
                return {"fiscal_years": {}, "growth_trends": {}, "category_trends": {}, "organization_trends": {}}

            # Process results into structured format
            fiscal_years = {}
            for _, row in result.iterrows():
                fy = str(row['FISCAL_YEAR'])
                if fy not in fiscal_years:
                    fiscal_years[fy] = {}
                fiscal_years[fy][row['APPROPRIATION_TYPE']] = {
                    "total_budget": int(row['TOTAL_BUDGET']),
                    "program_count": int(row['PROGRAM_COUNT'])
                }
            return {
                "fiscal_years": fiscal_years,
                "growth_trends": {},  # Could be calculated from fiscal_years data
                "category_trends": {},  # Could be calculated from fiscal_years data
                "organization_trends": {}  # Could be calculated from fiscal_years data
            }
        except Exception as e:
            logger.error(f"Error in get_multi_year_analysis: {e}")
            return {"fiscal_years": {}, "growth_trends": {}, "category_trends": {}, "organization_trends": {}}

    def get_program_details(self, element_code: str, fiscal_year: int, appropriation_type: Optional[str] = None) -> dict:
        """Get detailed program information including P40 identifiers for external linking"""
        try:
            where_conditions = [
                f"ELEMENT_CODE = '{element_code}'",
                f"FISCAL_YEAR = {fiscal_year}"
            ]
            if appropriation_type:
                where_conditions.append(f"APPROPRIATION_TYPE = '{appropriation_type}'")
            where_clause = " AND ".join(where_conditions)

            query = f"""
            SELECT *
            FROM {self.unified_table}
            WHERE {where_clause}
            LIMIT 1
            """
            result = self.execute_query(query)
            if result.empty:
                return {"error": "Program not found"}

            program_data = result.iloc[0].to_dict()
            return {
                "program_info": {
                    "element_code": program_data.get('ELEMENT_CODE'),
                    "element_title": program_data.get('ELEMENT_TITLE'),
                    "fiscal_year": program_data.get('FISCAL_YEAR'),
                    "appropriation_type": program_data.get('APPROPRIATION_TYPE'),
                    "organization": program_data.get('ORGANIZATION'),
                    "amount_k": program_data.get('AMOUNT_K'),
                    "weapons_category": program_data.get('WEAPONS_CATEGORY')
                }
            }
        except Exception as e:
            logger.error(f"Error in get_program_details: {e}")
            return {"error": str(e)}

    # Placeholder methods for other advanced features
    def get_appropriation_trends(self, start_fy: int = 2024, end_fy: int = 2026) -> pd.DataFrame:
        """Get appropriation trends"""
        return pd.DataFrame()

    def get_p40_coverage_analysis(self) -> pd.DataFrame:
        """Get P40 documentation coverage analysis"""
        return pd.DataFrame()

    def generate_budget_insights(self, fiscal_year: int = 2025) -> List[BudgetInsight]:
        """Generate AI-powered budget insights"""
        return []

    def generate_executive_summary(self, fiscal_year: int = 2025) -> Dict[str, Any]:
        """Generate executive summary for budget analysis"""
        return {}

    def get_market_opportunities(self, min_funding_m: float = 100.0, growth_threshold: float = 5.0) -> pd.DataFrame:
        """Get high-value, growing defense market opportunities"""
        return pd.DataFrame()

    def analyze_portfolio_fit(self, portfolio_companies: List[Dict[str, Any]]) -> pd.DataFrame:
        """Match portfolio companies to defense opportunities"""
        return pd.DataFrame()

    def get_investment_thesis_data(self, sector_focus: Optional[str] = None) -> Dict[str, Any]:
        """Generate comprehensive investment thesis data"""
        return {}

    def assess_competitive_landscape(self, market_segment: Optional[str] = None) -> pd.DataFrame:
        """Analyze competitive dynamics and market concentration"""
        return pd.DataFrame()

    def identify_acquisition_targets(self, min_revenue_m: float = 50.0, max_revenue_m: float = 500.0) -> pd.DataFrame:
        """Identify potential acquisition targets"""
        return pd.DataFrame()

    def forecast_market_trends(self, years_ahead: int = 3) -> Dict[str, Any]:
        """Forecast defense spending trends"""
        return {}

    def generate_pe_intelligence_report(self, portfolio_companies: List[Dict[str, Any]] = []) -> Dict[str, Any]:
        """Generate comprehensive PE intelligence report"""
        return {}


# Create service instances
snowflake_service = SnowflakeService()
budget_intelligence = DoDBudgetIntelligence() 

"""Snowflake API endpoints for opportunities data"""

bp = Blueprint("snowflake", __name__)
logger = logging.getLogger(__name__)


@bp.route("/health")
def check_snowflake_health():
    """Check Snowflake connection health"""
    try:
        health_info = snowflake_service.get_health_info()
        return jsonify(create_api_response(data=health_info))
    except Exception as e:
        logger.error(f"Error in snowflake health check: {str(e)}")
        return handle_api_error(e)




@bp.route("/metadata")
def get_snowflake_metadata():
    """Get table metadata for opportunities"""
    try:
        metadata_info = snowflake_service.get_metadata()
        return jsonify(create_api_response(data=metadata_info))
    except Exception as e:
        logger.error(f"Error in get_snowflake_metadata: {str(e)}")
        return handle_api_error(e)


@bp.route("/opportunities", methods=["POST"])
def get_snowflake_opportunities():
    """Get opportunities data with filtering, pagination, and search"""
    try:
        # Get request data
        data = request.get_json() or {}
        
        page = data.get('page', 1)
        page_size = data.get('page_size', 10)
        search_keywords = data.get('search_keywords', '')
        filters = data.get('filters', {})
        
        # Validate parameters
        page = max(1, int(page))
        page_size = min(max(1, int(page_size)), 100)  # Limit max page size
        
        result = snowflake_service.get_opportunities(
            
            filters=filters,
            page=page,
            page_size=page_size,
            search_keywords=search_keywords,
        )
        
        return jsonify(create_api_response(
            data=result.get('data', []),
            total=result.get('total_count', 0),
            metadata={
                'page': result.get('page', page),
                'page_size': result.get('page_size', page_size)
            }
        ))
        
    except Exception as e:
        logger.error(f"Error in get_snowflake_opportunities: {str(e)}")
        return handle_api_error(e)


@bp.route("/opportunities", methods=["GET"])
def get_snowflake_opportunities_get():
    """GET version of opportunities endpoint for simple queries"""
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 10, type=int)
        search_keywords = request.args.get('search', '')
        
        # Validate parameters
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        
        result = snowflake_service.get_opportunities(
            filters={},
            page=page,
            page_size=page_size,
            search_keywords=search_keywords,
        )
        
        return jsonify(create_api_response(
            data=result.get('data', []),
            total=result.get('total_count', 0),
            metadata={
                'page': result.get('page', page),
                'page_size': result.get('page_size', page_size)
            }
        ))
        
    except Exception as e:
        logger.error(f"Error in get_snowflake_opportunities_get: {str(e)}")
        return handle_api_error(e) 
