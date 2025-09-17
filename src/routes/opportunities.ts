/**
 * Opportunities API Routes
 * Provides access to government contract opportunities data from FOUNDRY.SAM_CONTRACTS.RAW_CSV
 * Extracted and adapted from foundry_api lambda function
 */

import { Router, Request, Response } from 'express';
import { getDatabaseConfig } from '../config/database';
import { QueryBuilder, FilterOptions } from '../utils/queryBuilder';
import { createLogger } from '../utils/logger';
import snowflake from 'snowflake-sdk';

const router = Router();
const logger = createLogger();

// Database configuration for opportunities
const OPPORTUNITIES_CONFIG = {
  database: 'FOUNDRY',
  schema: 'SAM_CONTRACTS', 
  table: 'RAW_CSV'
};

/**
 * Execute Snowflake query and return results
 */
async function executeSnowflakeQuery(query: string): Promise<any[]> {
  const config = getDatabaseConfig();
  const connection = snowflake.createConnection(config.snowflake);

  return new Promise((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) {
        logger.error('Failed to connect to Snowflake:', err);
        reject(new Error(`Snowflake connection failed: ${err.message}`));
        return;
      }

      conn.execute({
        sqlText: query,
        complete: (err, stmt, rows) => {
          connection.destroy((err) => {
            if (err) logger.error('Error destroying connection:', err);
          });
          
          if (err) {
            logger.error('Query execution failed:', err);
            reject(new Error(`Query failed: ${err.message}`));
            return;
          }

          // Convert results to proper format
          const columns = stmt.getColumns();
          const columnNames = columns.map(col => col.getName());
          
          const data = rows?.map(row => {
            const rowObj: Record<string, any> = {};
            columnNames.forEach((colName, index) => {
              let value = row[colName] || row[index];
              
              // Handle different data types
              if (value instanceof Date) {
                rowObj[colName] = value.toISOString();
              } else if (typeof value === 'object' && value !== null && 'toNumber' in value) {
                // Handle Snowflake Decimal types
                rowObj[colName] = parseFloat(value.toString());
              } else {
                rowObj[colName] = value;
              }
            });
            return rowObj;
          }) || [];

          resolve(data);
        }
      });
    });
  });
}

/**
 * Get column information for the opportunities table
 */
async function getOpportunitiesColumns(): Promise<string[]> {
  const query = `
    SELECT COLUMN_NAME
    FROM ${OPPORTUNITIES_CONFIG.database}.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${OPPORTUNITIES_CONFIG.table}'
    AND TABLE_SCHEMA = '${OPPORTUNITIES_CONFIG.schema}'
    ORDER BY ORDINAL_POSITION
  `;

  try {
    const result = await executeSnowflakeQuery(query);
    return result.map(row => row.COLUMN_NAME);
  } catch (error) {
    logger.error('Failed to get column information:', error);
    return [];
  }
}

/**
 * GET /api/v1/opportunities
 * Get government contract opportunities with advanced filtering and search
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      page_size = '10',
      search_keywords = '',
      ...filters
    } = req.query;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const pageSize = Math.min(1000, Math.max(1, parseInt(page_size as string) || 10));

    logger.info(`Opportunities request: page=${pageNum}, pageSize=${pageSize}, search="${search_keywords}"`);

    // Get column information
    const columnNames = await getOpportunitiesColumns();
    if (columnNames.length === 0) {
      res.status(500).json({
        error: 'Unable to retrieve table schema information',
        message: 'The opportunities table schema could not be accessed'
      });
      return;
    }

    // Initialize query builder
    const queryBuilder = new QueryBuilder(OPPORTUNITIES_CONFIG);

    // Process filters (convert query params to filter format)
    const processedFilters: FilterOptions = {};
    
    // Handle special filter parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (typeof value === 'string') {
        try {
          // Try to parse as JSON for complex filters
          const parsed = JSON.parse(value);
          processedFilters[key] = parsed;
        } catch {
          // Handle as simple string filter
          if (value.includes(',')) {
            // Comma-separated list
            processedFilters[key] = value.split(',').map(v => v.trim());
          } else {
            processedFilters[key] = value;
          }
        }
      } else {
        processedFilters[key] = value;
      }
    });

    // Build and execute queries
    const { dataQuery, countQuery } = queryBuilder.buildQuery({
      filters: processedFilters,
      searchKeywords: search_keywords as string,
      page: pageNum,
      pageSize,
      columnNames,
      orderBy: columnNames.length > 0 ? columnNames[0] : undefined // Use first column for ordering
    });

    logger.info('Executing count query:', countQuery);
    const countResult = await executeSnowflakeQuery(countQuery);
    const totalCount = countResult[0]?.TOTAL_COUNT || 0;

    logger.info('Executing data query:', dataQuery);
    const opportunities = await executeSnowflakeQuery(dataQuery);

    // Return paginated results
    res.json({
      data: opportunities,
      total_count: totalCount,
      page: pageNum,
      page_size: pageSize,
      total_pages: Math.ceil(totalCount / pageSize),
      has_next: pageNum * pageSize < totalCount,
      has_previous: pageNum > 1
    });

  } catch (error) {
    logger.error('Error in opportunities endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/opportunities
 * Advanced opportunities search with complex filters (matches lambda function format)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      page_size = 10,
      search_keywords = '',
      filters = {}
    } = req.body;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(1000, Math.max(1, parseInt(page_size) || 10));

    logger.info(`Opportunities POST request: page=${pageNum}, pageSize=${pageSize}`);
    logger.info('Filters:', JSON.stringify(filters, null, 2));

    // Get column information
    const columnNames = await getOpportunitiesColumns();
    if (columnNames.length === 0) {
      res.status(500).json({
        error: 'Unable to retrieve table schema information',
        message: 'The opportunities table schema could not be accessed'
      });
      return;
    }

    // Initialize query builder
    const queryBuilder = new QueryBuilder(OPPORTUNITIES_CONFIG);

    // Build and execute queries
    const { dataQuery, countQuery } = queryBuilder.buildQuery({
      filters: filters as FilterOptions,
      searchKeywords: search_keywords,
      page: pageNum,
      pageSize,
      columnNames,
      orderBy: columnNames.length > 0 ? columnNames[0] : undefined // Use first column for ordering
    });

    logger.info('Executing count query:', countQuery);
    const countResult = await executeSnowflakeQuery(countQuery);
    const totalCount = countResult[0]?.TOTAL_COUNT || 0;

    logger.info('Executing data query:', dataQuery);
    const opportunities = await executeSnowflakeQuery(dataQuery);

    // Return results in lambda-compatible format
    res.json({
      data: opportunities,
      total_count: totalCount,
      page: pageNum,
      page_size: pageSize
    });

  } catch (error) {
    logger.error('Error in opportunities POST endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/opportunities/schema
 * Get table schema information
 */
router.get('/schema', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        ORDINAL_POSITION
      FROM ${OPPORTUNITIES_CONFIG.database}.INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${OPPORTUNITIES_CONFIG.table}'
      AND TABLE_SCHEMA = '${OPPORTUNITIES_CONFIG.schema}'
      ORDER BY ORDINAL_POSITION
    `;

    const columns = await executeSnowflakeQuery(query);
    
    res.json({
      table: `${OPPORTUNITIES_CONFIG.database}.${OPPORTUNITIES_CONFIG.schema}.${OPPORTUNITIES_CONFIG.table}`,
      columns,
      total_columns: columns.length
    });

  } catch (error) {
    logger.error('Error getting opportunities schema:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
