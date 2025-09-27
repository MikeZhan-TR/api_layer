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
import { searchCortex, convertCortexResultsToOpportunities } from '../services/cortexSearchService';

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
    const pageSize = Math.min(50000, Math.max(1, parseInt(page_size as string) || 10));

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
 * Advanced opportunities search with complex filters and Cortex search integration
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      page_size = 10,
      search_keywords = '',
      filters = {},
      use_cortex = true, // New parameter to enable/disable Cortex search
      columns = ['DESCRIPTION', 'TITLE', 'SOL_NUMBER', 'FPDS_CODE'], // Default columns for Cortex search
      limit = 10 // Default limit for Cortex search
    } = req.body;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(50000, Math.max(1, parseInt(page_size) || 10));

    logger.info(`Opportunities POST request: page=${pageNum}, pageSize=${pageSize}, use_cortex=${use_cortex}`);
    logger.info('Filters:', JSON.stringify(filters, null, 2));

    // If search_keywords are provided and Cortex is enabled, use Cortex search
    if (search_keywords && use_cortex) {
      try {
        logger.info('Using Cortex search for keywords:', search_keywords);
        
        const cortexRequest = {
          query: search_keywords,
          columns: columns,
          limit: limit
        };

        logger.info('Cortex search request:', JSON.stringify(cortexRequest, null, 2));
        const cortexResponse = await searchCortex(cortexRequest);
        const opportunities = convertCortexResultsToOpportunities(cortexResponse.results);

        // Return Cortex search results
        res.json({
          data: opportunities,
          total_count: opportunities.length,
          page: pageNum,
          page_size: pageSize,
          search_method: 'cortex',
          cortex_request_id: cortexResponse.request_id,
          search_params: {
            query: search_keywords,
            columns: columns,
            limit: limit
          }
        });

        return;
      } catch (cortexError) {
        logger.warn('Cortex search failed, falling back to SQL search:', cortexError);
        // Fall through to regular SQL search
      }
    }

    // Fallback to regular SQL search
    logger.info('Using SQL search');

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
      page_size: pageSize,
      search_method: 'sql'
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
 * POST /api/v1/opportunities/cortex-search
 * Direct Cortex search endpoint for advanced search capabilities
 */
// Test endpoint to check Python environment
router.get('/test-python', async (req: Request, res: Response): Promise<void> => {
  try {
    const { spawn } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.join(process.cwd(), 'test_python_modules.py');
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    
    logger.info(`Testing Python environment with command: ${pythonCommand} ${scriptPath}`);
    
    const pythonProcess = spawn(pythonCommand, [scriptPath]);
    
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code: number | null) => {
      logger.info(`Python test completed with code: ${code}`);
      logger.info(`STDOUT: ${stdout}`);
      logger.info(`STDERR: ${stderr}`);
      
      res.json({
        exit_code: code,
        stdout: stdout,
        stderr: stderr,
        python_command: pythonCommand,
        script_path: scriptPath
      });
    });

    pythonProcess.on('error', (error: Error) => {
      logger.error('Failed to start Python process:', error);
      res.status(500).json({
        error: 'Failed to start Python process',
        message: error.message
      });
    });

  } catch (error) {
    logger.error('Error in Python test endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

router.post('/cortex-search', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      query = '',
      columns = ['DESCRIPTION', 'TITLE', 'SOL_NUMBER', 'FPDS_CODE'],
      limit = 10
    } = req.body;

    if (!query) {
      res.status(400).json({
        error: 'Query parameter is required',
        message: 'Please provide a search query'
      });
      return;
    }

    logger.info(`Cortex search request: query="${query}", columns=${JSON.stringify(columns)}, limit=${limit}`);

    const cortexRequest = {
      query,
      columns,
      limit
    };

    const cortexResponse = await searchCortex(cortexRequest);
    const opportunities = convertCortexResultsToOpportunities(cortexResponse.results);

    res.json({
      data: opportunities,
      total_count: opportunities.length,
      search_method: 'cortex',
      cortex_request_id: cortexResponse.request_id,
      search_params: {
        query,
        columns,
        limit
      }
    });

  } catch (error) {
    logger.error('Error in Cortex search endpoint:', error);
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
