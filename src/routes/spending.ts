import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { strictRateLimiterMiddleware } from '../middleware/rateLimiter';
import { SpendingSummary, ApiResponse } from '../types/usaspending';

const router = Router();

// GET /api/v1/spending/by-state - Spending summary by state
router.get('/by-state', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      state_code,
      state_name,
      total_obligations,
      award_count,
      recipient_count
    FROM summary_state_view
    ${whereClause}
    ORDER BY total_obligations DESC
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery<SpendingSummary>(query, binds, { 
    useCache: true, 
    cacheTTL: 1800 
  });
  
  const response: ApiResponse<SpendingSummary[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      fiscalYear,
      aggregation: 'by_state'
    }
  };
  
  res.json(response);
}));

// GET /api/v1/spending/by-agency - Spending summary by agency
router.get('/by-agency', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      agency_name,
      agency_code,
      COUNT(*) as award_count,
      SUM(total_obligation) as total_obligations,
      AVG(total_obligation) as avg_obligation,
      COUNT(DISTINCT recipient_name) as recipient_count
    FROM awards
    ${whereClause}
    GROUP BY agency_name, agency_code
    ORDER BY total_obligations DESC
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery<SpendingSummary>(query, binds, { 
    useCache: true, 
    cacheTTL: 1800 
  });
  
  const response: ApiResponse<SpendingSummary[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      fiscalYear,
      aggregation: 'by_agency'
    }
  };
  
  res.json(response);
}));

// GET /api/v1/spending/trends/monthly - Monthly spending trends
router.get('/trends/monthly', strictRateLimiterMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  const agencyCode = req.query.agency_code as string;
  
  const whereConditions: string[] = [];
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereConditions.push('fiscal_year = ?');
    binds.push(parseInt(fiscalYear));
  }
  
  if (agencyCode) {
    whereConditions.push('agency_code = ?');
    binds.push(agencyCode);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  
  const query = `
    SELECT 
      DATE_TRUNC('month', date_signed) as month,
      COUNT(*) as award_count,
      SUM(total_obligation) as total_obligations,
      AVG(total_obligation) as avg_obligation
    FROM awards
    ${whereClause}
    AND date_signed IS NOT NULL
    GROUP BY DATE_TRUNC('month', date_signed)
    ORDER BY month
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 1800 
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      fiscalYear,
      agencyCode,
      aggregation: 'monthly_trends'
    }
  };
  
  res.json(response);
}));

// GET /api/v1/spending/by-category - Spending by award category
router.get('/by-category', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE a.fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      a.award_type,
      COUNT(*) as award_count,
      SUM(a.total_obligation) as total_obligations,
      AVG(a.total_obligation) as avg_obligation
    FROM awards a
    ${whereClause}
    GROUP BY a.award_type
    ORDER BY total_obligations DESC
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 1800 
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      fiscalYear,
      aggregation: 'by_category'
    }
  };
  
  res.json(response);
}));

// GET /api/v1/spending/comparison - Compare spending across multiple dimensions
router.get('/comparison', strictRateLimiterMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const dimension = req.query.dimension as string || 'agency'; // agency, state, category
  const fiscalYears = req.query.fiscal_years as string; // comma-separated
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  
  if (!fiscalYears) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FISCAL_YEARS',
        message: 'fiscal_years parameter is required for comparison',
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const years = fiscalYears.split(',').map(y => parseInt(y.trim()));
  const yearPlaceholders = years.map(() => '?').join(',');
  
  let groupByField = 'agency_name';
  let selectField = 'agency_name';
  
  if (dimension === 'state') {
    groupByField = 'place_of_performance_state';
    selectField = 'place_of_performance_state as state_code';
  } else if (dimension === 'category') {
    groupByField = 'award_type';
    selectField = 'award_type';
  }
  
  const query = `
    SELECT 
      ${selectField},
      fiscal_year,
      COUNT(*) as award_count,
      SUM(total_obligation) as total_obligations
    FROM awards
    WHERE fiscal_year IN (${yearPlaceholders})
    GROUP BY ${groupByField}, fiscal_year
    ORDER BY total_obligations DESC
    LIMIT ${limit * years.length}
  `;
  
  const result = await snowflakeService.executeQuery(query, years, { 
    useCache: true, 
    cacheTTL: 1800 
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      dimension,
      fiscalYears: years,
      aggregation: 'comparison'
    }
  };
  
  res.json(response);
}));

// GET /api/v1/spending/totals - Overall spending totals
router.get('/totals', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      COUNT(*) as total_awards,
      SUM(total_obligation) as total_obligations,
      AVG(total_obligation) as avg_obligation,
      MIN(total_obligation) as min_obligation,
      MAX(total_obligation) as max_obligation,
      COUNT(DISTINCT agency_code) as unique_agencies,
      COUNT(DISTINCT recipient_name) as unique_recipients,
      COUNT(DISTINCT place_of_performance_state) as unique_states
    FROM awards
    ${whereClause}
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 3600 // Cache for 1 hour
  });
  
  const response: ApiResponse<any> = {
    success: true,
    data: result.rows[0],
    metadata: {
      executionTime: result.executionTime,
      fiscalYear,
      aggregation: 'totals'
    }
  };
  
  res.json(response);
}));

export default router;

