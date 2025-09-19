/**
 * Budget API Routes
 * Provides access to defense budget allocation data from FOUNDRY.BUDGET.UNIFIED
 * Extracted and adapted from foundry_api lambda function
 * Includes DoD Budget Intelligence endpoints migrated from foundry-point-prod
 */

import { Router, Request, Response } from 'express';
import { getDatabaseConfig } from '../config/database';
import { QueryBuilder, FilterOptions } from '../utils/queryBuilder';
import { createLogger } from '../utils/logger';
import { budgetIntelligenceService } from '../services/budgetIntelligenceService';
import snowflake from 'snowflake-sdk';

const router = Router();
const logger = createLogger();

// Database configuration for budget data
const BUDGET_CONFIG = {
  database: 'FOUNDRY',
  schema: 'BUDGET',
  table: 'UNIFIED'
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
 * Get column information for the budget table
 */
async function getBudgetColumns(): Promise<string[]> {
  const query = `
    SELECT COLUMN_NAME
    FROM ${BUDGET_CONFIG.database}.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${BUDGET_CONFIG.table}'
    AND TABLE_SCHEMA = '${BUDGET_CONFIG.schema}'
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
 * GET /api/v1/budget
 * Get defense budget allocation data with advanced filtering and search
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

    logger.info(`Budget request: page=${pageNum}, pageSize=${pageSize}, search="${search_keywords}"`);

    // Get column information
    const columnNames = await getBudgetColumns();
    if (columnNames.length === 0) {
      res.status(500).json({
        error: 'Unable to retrieve table schema information',
        message: 'The budget table schema could not be accessed'
      });
      return;
    }

    // Initialize query builder
    const queryBuilder = new QueryBuilder(BUDGET_CONFIG);

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
    const budgetData = await executeSnowflakeQuery(dataQuery);

    // Return paginated results
    res.json({
      data: budgetData,
      total_count: totalCount,
      page: pageNum,
      page_size: pageSize,
      total_pages: Math.ceil(totalCount / pageSize),
      has_next: pageNum * pageSize < totalCount,
      has_previous: pageNum > 1
    });

  } catch (error) {
    logger.error('Error in budget endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/budget
 * Advanced budget search with complex filters (matches lambda function format)
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
    const pageSize = Math.min(50000, Math.max(1, parseInt(page_size) || 10));

    logger.info(`Budget POST request: page=${pageNum}, pageSize=${pageSize}`);
    logger.info('Filters:', JSON.stringify(filters, null, 2));

    // Get column information
    const columnNames = await getBudgetColumns();
    if (columnNames.length === 0) {
      res.status(500).json({
        error: 'Unable to retrieve table schema information',
        message: 'The budget table schema could not be accessed'
      });
      return;
    }

    // Initialize query builder
    const queryBuilder = new QueryBuilder(BUDGET_CONFIG);

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
    const budgetData = await executeSnowflakeQuery(dataQuery);

    // Return results in lambda-compatible format
    res.json({
      data: budgetData,
      total_count: totalCount,
      page: pageNum,
      page_size: pageSize
    });

  } catch (error) {
    logger.error('Error in budget POST endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/schema
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
      FROM ${BUDGET_CONFIG.database}.INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${BUDGET_CONFIG.table}'
      AND TABLE_SCHEMA = '${BUDGET_CONFIG.schema}'
      ORDER BY ORDINAL_POSITION
    `;

    const columns = await executeSnowflakeQuery(query);
    
    res.json({
      table: `${BUDGET_CONFIG.database}.${BUDGET_CONFIG.schema}.${BUDGET_CONFIG.table}`,
      columns,
      total_columns: columns.length
    });

  } catch (error) {
    logger.error('Error getting budget schema:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/summary
 * Get budget summary statistics
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { fiscal_year, organization } = req.query;
    
    let whereClause = '';
    const conditions: string[] = [];
    
    if (fiscal_year) {
      conditions.push(`"FISCAL_YEAR" = ${fiscal_year}`);
    }
    
    if (organization) {
      conditions.push(`"ORGANIZATION" = '${String(organization).replace(/'/g, "''")}'`);
    }
    
    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const summaryQuery = `
      SELECT 
        "FISCAL_YEAR",
        "ORGANIZATION",
        "APPROPRIATION_TYPE",
        COUNT(*) as record_count,
        SUM("AMOUNT_K") as total_amount_k,
        AVG("AMOUNT_K") as avg_amount_k,
        MIN("AMOUNT_K") as min_amount_k,
        MAX("AMOUNT_K") as max_amount_k
      FROM ${BUDGET_CONFIG.database}.${BUDGET_CONFIG.schema}.${BUDGET_CONFIG.table}
      ${whereClause}
      GROUP BY "FISCAL_YEAR", "ORGANIZATION", "APPROPRIATION_TYPE"
      ORDER BY "FISCAL_YEAR" DESC, "ORGANIZATION", "APPROPRIATION_TYPE"
    `;

    const summary = await executeSnowflakeQuery(summaryQuery);
    
    res.json({
      summary,
      filters_applied: {
        fiscal_year: fiscal_year || 'all',
        organization: organization || 'all'
      },
      total_groups: summary.length
    });

  } catch (error) {
    logger.error('Error getting budget summary:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// ========================
// DOD BUDGET INTELLIGENCE ENDPOINTS
// ========================

/**
 * GET /api/v1/budget/programs/summary
 * Get budget programs summary with real utilization rates
 */
router.get('/programs/summary', async (req: Request, res: Response) => {
  try {
    const summary = await budgetIntelligenceService.get_budget_programs_summary();
    
    res.json({
      success: true,
      data: {
        budget_totals: {
          total_budget: summary.total_budget || 0,
          total_programs: summary.total_programs || 0,
          total_organizations: summary.total_organizations || 0,
          total_categories: summary.total_categories || 0,
        },
        contract_linking: {
          total_linkable: summary.contract_linkable_programs || 0,
          pe_numbers: summary.pe_programs || 0,
          bli_numbers: summary.bli_programs || 0,
          weapons_systems: summary.weapons_programs || 0,
        },
        fiscal_breakdown: {
          fy_2024_total: summary.fy_2024_total || 0,
          fy_2025_total: summary.fy_2025_total || 0,
          fy_2026_total: summary.fy_2026_total || 0,
        },
        utilization: {
          real_utilization_rate: summary.real_utilization_rate,
          total_obligated: summary.total_obligated
        }
      },
      message: 'Budget programs summary retrieved successfully',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting budget programs summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/account-shifts
 * Get budget shifts between FY2025 and FY2026 by organization/branch
 */
router.get('/account-shifts', async (req: Request, res: Response) => {
  try {
    const shifts = await budgetIntelligenceService.get_account_shifts_analysis();
    
    res.json({
      success: true,
      data: {
        shifts: shifts,
        total_records: shifts.length,
        fiscal_years: [2025, 2026],
      },
      message: 'Account shifts analysis retrieved successfully',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting account shifts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/trends
 * Get budget execution trends showing requested vs enacted vs spent vs remaining
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const {
      organization,
      category,
      fiscal_year,
      min_budget,
      limit = 100,
      offset = 0
    } = req.query;

    const trends = await budgetIntelligenceService.get_budget_execution_trends({
      organization: organization as string,
      category: category as string,
      fiscal_year: fiscal_year ? parseInt(fiscal_year as string) : undefined,
      min_budget: min_budget ? parseFloat(min_budget as string) : undefined,
      limit: parseInt(limit as string) || 100,
      offset: parseInt(offset as string) || 0
    });

    res.json({
      success: true,
      data: trends,
      message: 'Budget execution trends retrieved successfully',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting budget trends:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/programs
 * Get individual budget programs with filtering and pagination
 */
router.get('/programs', async (req: Request, res: Response) => {
  try {
    const {
      organization,
      category,
      weapons_category,
      fiscal_year,
      min_budget,
      search_query,
      sort_by = 'primary_budget_amount',
      sort_order = 'desc',
      limit = 100,
      offset = 0
    } = req.query;

    const programs = await budgetIntelligenceService.get_budget_programs({
      organization: organization as string,
      category: category as string,
      weapons_category: weapons_category as string,
      fiscal_year: fiscal_year ? parseInt(fiscal_year as string) : undefined,
      min_budget: min_budget ? parseFloat(min_budget as string) : undefined,
      search_query: search_query as string,
      sort_by: sort_by as string,
      sort_order: sort_order as string,
      limit: parseInt(limit as string) || 100,
      offset: parseInt(offset as string) || 0
    });

    res.json({
      success: true,
      data: programs,
      message: 'Budget programs retrieved successfully',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting budget programs:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/programs/by-category
 * Get programs grouped by category
 */
router.get('/programs/by-category', async (req: Request, res: Response) => {
  try {
    const { fiscal_year } = req.query;
    
    const categories = await budgetIntelligenceService.get_programs_by_category(
      fiscal_year ? parseInt(fiscal_year as string) : undefined
    );

    res.json({
      success: true,
      data: {
        categories: categories,
        total_categories: categories.length,
      },
      message: 'Programs by category retrieved successfully',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting programs by category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/programs/weapons-intelligence
 * Get weapons systems intelligence and analysis
 */
router.get('/programs/weapons-intelligence', async (req: Request, res: Response) => {
  try {
    const {
      category,
      min_budget,
      limit = 50
    } = req.query;

    const weaponsIntel = await budgetIntelligenceService.get_weapons_intelligence({
      category: category as string,
      min_budget: min_budget ? parseFloat(min_budget as string) : undefined,
      limit: parseInt(limit as string) || 50
    });

    res.json({
      success: true,
      data: {
        summary: weaponsIntel.summary,
        high_value_systems: weaponsIntel.high_value_systems,
        categories: weaponsIntel.categories,
        organizations: weaponsIntel.organizations,
      },
      message: 'Weapons intelligence retrieved successfully',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting weapons intelligence:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/budget/health
 * Check budget intelligence service health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isConnected = await budgetIntelligenceService.connect();
    
    res.json({
      success: true,
      data: {
        status: isConnected ? 'healthy' : 'unhealthy',
        service: 'DoD Budget Intelligence',
        timestamp: new Date().toISOString(),
        connection: isConnected ? 'connected' : 'disconnected'
      },
      message: isConnected ? 'Budget intelligence service is healthy' : 'Budget intelligence service is unhealthy'
    });
  } catch (error) {
    logger.error('Error checking budget intelligence health:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
