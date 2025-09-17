import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { Agency, ApiResponse, PaginationInfo } from '../types/usaspending';

const router = Router();

// GET /api/v1/agencies - List all agencies
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const search = req.query.search as string;
  const offset = (page - 1) * limit;
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (search) {
    whereClause = 'WHERE agency_name ILIKE ? OR agency_code ILIKE ?';
    binds.push(`%${search}%`, `%${search}%`);
  }
  
  const query = `
    SELECT 
      agency_id,
      agency_name,
      agency_code,
      agency_abbreviation,
      toptier_agency_id,
      subtier_agency_id,
      cgac_code,
      frec_code,
      is_frec,
      agency_type
    FROM agencies
    ${whereClause}
    ORDER BY agency_name
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM agencies
    ${whereClause}
  `;
  
  const [results, countResults] = await Promise.all([
    snowflakeService.executeQuery<Agency>(query, binds, { useCache: true }),
    snowflakeService.executeQuery<{ TOTAL: number }>(countQuery, binds, { useCache: true })
  ]);
  
  const total = countResults.rows[0]?.TOTAL || 0;
  const totalPages = Math.ceil(total / limit);
  
  const pagination: PaginationInfo = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
  
  const response: ApiResponse<Agency[]> = {
    success: true,
    data: results.rows,
    pagination,
    metadata: {
      executionTime: results.executionTime,
      search
    }
  };
  
  res.json(response);
}));

// GET /api/v1/agencies/:code - Get specific agency
router.get('/:code', asyncHandler(async (req: Request, res: Response) => {
  const agencyCode = req.params.code;
  
  const query = `
    SELECT *
    FROM agencies
    WHERE agency_code = ? OR agency_id = ?
  `;
  
  const result = await snowflakeService.executeQuery<Agency>(
    query, 
    [agencyCode, agencyCode], 
    { useCache: true }
  );
  
  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: {
        code: 'AGENCY_NOT_FOUND',
        message: `Agency with code ${agencyCode} not found`,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const response: ApiResponse<Agency> = {
    success: true,
    data: result.rows[0],
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/agencies/:code/spending - Agency spending summary
router.get('/:code/spending', asyncHandler(async (req: Request, res: Response) => {
  const agencyCode = req.params.code;
  const fiscalYear = req.query.fiscal_year as string;
  
  let whereClause = 'WHERE agency_code = ?';
  const binds = [agencyCode];
  
  if (fiscalYear) {
    whereClause += ' AND fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      fiscal_year,
      COUNT(*) as award_count,
      SUM(total_obligation) as total_spending,
      AVG(total_obligation) as avg_award_amount,
      MIN(total_obligation) as min_award_amount,
      MAX(total_obligation) as max_award_amount
    FROM awards
    ${whereClause}
    GROUP BY fiscal_year
    ORDER BY fiscal_year DESC
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 1800 
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      agencyCode,
      fiscalYear,
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/agencies/top/by-spending - Top agencies by spending
router.get('/top/by-spending', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const fiscalYear = req.query.fiscal_year as string;
  
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
      SUM(total_obligation) as total_spending,
      AVG(total_obligation) as avg_award_amount
    FROM awards
    ${whereClause}
    GROUP BY agency_name, agency_code
    ORDER BY total_spending DESC
    LIMIT ${limit}
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
      limit
    }
  };
  
  res.json(response);
}));

export default router;

