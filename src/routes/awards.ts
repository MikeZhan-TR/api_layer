import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { strictRateLimiterMiddleware } from '../middleware/rateLimiter';
import { Award, SearchFilters, ApiResponse, PaginationInfo } from '../types/usaspending';
import { z } from 'zod';

const router = Router();

// Validation schemas
const searchSchema = z.object({
  fiscal_year: z.union([z.number(), z.array(z.number())]).optional(),
  agency_code: z.union([z.string(), z.array(z.string())]).optional(),
  state_code: z.union([z.string(), z.array(z.string())]).optional(),
  award_type: z.union([z.string(), z.array(z.string())]).optional(),
  recipient_name: z.string().optional(),
  naics_code: z.union([z.string(), z.array(z.string())]).optional(),
  psc_code: z.union([z.string(), z.array(z.string())]).optional(),
  min_amount: z.number().min(0).optional(),
  max_amount: z.number().min(0).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  keywords: z.string().optional(),
  sort_by: z.enum(['total_obligation', 'date_signed', 'recipient_name', 'agency_name']).default('total_obligation'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(1000).default(50)
});

// GET /api/v1/awards - Search and list awards
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const filters = searchSchema.parse(req.query);
  
  // Build WHERE clause
  const whereConditions: string[] = [];
  const binds: any[] = [];
  
  if (filters.fiscal_year) {
    if (Array.isArray(filters.fiscal_year)) {
      const placeholders = filters.fiscal_year.map(() => '?').join(',');
      whereConditions.push(`fiscal_year IN (${placeholders})`);
      binds.push(...filters.fiscal_year);
    } else {
      whereConditions.push('fiscal_year = ?');
      binds.push(filters.fiscal_year);
    }
  }
  
  if (filters.agency_code) {
    if (Array.isArray(filters.agency_code)) {
      const placeholders = filters.agency_code.map(() => '?').join(',');
      whereConditions.push(`agency_code IN (${placeholders})`);
      binds.push(...filters.agency_code);
    } else {
      whereConditions.push('agency_code = ?');
      binds.push(filters.agency_code);
    }
  }
  
  if (filters.state_code) {
    if (Array.isArray(filters.state_code)) {
      const placeholders = filters.state_code.map(() => '?').join(',');
      whereConditions.push(`place_of_performance_state IN (${placeholders})`);
      binds.push(...filters.state_code);
    } else {
      whereConditions.push('place_of_performance_state = ?');
      binds.push(filters.state_code);
    }
  }
  
  if (filters.min_amount) {
    whereConditions.push('total_obligation >= ?');
    binds.push(filters.min_amount);
  }
  
  if (filters.max_amount) {
    whereConditions.push('total_obligation <= ?');
    binds.push(filters.max_amount);
  }
  
  if (filters.date_from) {
    whereConditions.push('date_signed >= ?');
    binds.push(filters.date_from);
  }
  
  if (filters.date_to) {
    whereConditions.push('date_signed <= ?');
    binds.push(filters.date_to);
  }
  
  if (filters.recipient_name) {
    whereConditions.push('recipient_name ILIKE ?');
    binds.push(`%${filters.recipient_name}%`);
  }
  
  if (filters.keywords) {
    whereConditions.push('(award_description ILIKE ? OR recipient_name ILIKE ?)');
    binds.push(`%${filters.keywords}%`, `%${filters.keywords}%`);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;
  
  // Main query
  const query = `
    SELECT 
      award_id,
      recipient_name,
      recipient_unique_id,
      agency_name,
      agency_code,
      total_obligation,
      date_signed,
      award_type,
      award_description,
      naics_code,
      naics_description,
      psc_code,
      psc_description,
      place_of_performance_state,
      place_of_performance_city,
      recipient_state,
      recipient_city,
      fiscal_year
    FROM awards
    ${whereClause}
    ORDER BY ${filters.sort_by} ${filters.sort_order}
    LIMIT ${filters.limit} OFFSET ${offset}
  `;
  
  // Count query for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM awards
    ${whereClause}
  `;
  
  // Execute queries
  const [results, countResults] = await Promise.all([
    snowflakeService.executeQuery<Award>(query, binds, { useCache: true }),
    snowflakeService.executeQuery<{ TOTAL: number }>(countQuery, binds, { useCache: true })
  ]);
  
  const total = countResults.rows[0]?.TOTAL || 0;
  const totalPages = Math.ceil(total / filters.limit);
  
  const pagination: PaginationInfo = {
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages,
    hasNext: filters.page < totalPages,
    hasPrev: filters.page > 1
  };
  
  const response: ApiResponse<Award[]> = {
    success: true,
    data: results.rows,
    pagination,
    metadata: {
      executionTime: results.executionTime,
      filters: filters
    }
  };
  
  res.json(response);
}));

// GET /api/v1/awards/:id - Get specific award details
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const awardId = req.params.id;
  
  const query = `
    SELECT *
    FROM awards
    WHERE award_id = ?
  `;
  
  const result = await snowflakeService.executeQuery<Award>(query, [awardId], { useCache: true });
  
  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: {
        code: 'AWARD_NOT_FOUND',
        message: `Award with ID ${awardId} not found`,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const response: ApiResponse<Award> = {
    success: true,
    data: result.rows[0]!,
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/awards/:id/transactions - Get transactions for specific award
router.get('/:id/transactions', asyncHandler(async (req: Request, res: Response) => {
  const awardId = req.params.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const offset = (page - 1) * limit;
  
  const query = `
    SELECT 
      transaction_id,
      award_id,
      modification_number,
      transaction_description,
      federal_action_obligation,
      action_date,
      action_type,
      action_type_description,
      fiscal_year
    FROM transaction_search
    WHERE award_id = ?
    ORDER BY action_date DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM transaction_search
    WHERE award_id = ?
  `;
  
  const [results, countResults] = await Promise.all([
    snowflakeService.executeQuery(query, [awardId], { useCache: true }),
    snowflakeService.executeQuery<{ TOTAL: number }>(countQuery, [awardId], { useCache: true })
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
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: results.rows,
    pagination,
    metadata: {
      awardId,
      executionTime: results.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/awards/summary/by-agency - Awards summary by agency (with rate limiting)
router.get('/summary/by-agency', strictRateLimiterMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  
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
      SUM(total_obligation) as total_amount,
      AVG(total_obligation) as avg_amount,
      MIN(total_obligation) as min_amount,
      MAX(total_obligation) as max_amount
    FROM awards
    ${whereClause}
    GROUP BY agency_name, agency_code
    ORDER BY total_amount DESC
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 1800 // 30 minutes cache for summaries
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      fiscal_year: fiscalYear,
      aggregation: 'by_agency'
    }
  };
  
  res.json(response);
}));

export default router;

