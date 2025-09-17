import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { Recipient, ApiResponse, PaginationInfo } from '../types/usaspending';
import { z } from 'zod';

const router = Router();

const recipientSearchSchema = z.object({
  name: z.string().optional(),
  uei: z.string().optional(),
  duns: z.string().optional(),
  state_code: z.string().optional(),
  city: z.string().optional(),
  business_type: z.string().optional(),
  min_award_amount: z.number().min(0).optional(),
  max_award_amount: z.number().min(0).optional(),
  sort_by: z.enum(['recipient_name', 'total_award_amount', 'award_count']).default('total_award_amount'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(500).default(50)
});

// GET /api/v1/recipients - Search recipients
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const filters = recipientSearchSchema.parse(req.query);
  
  // Build WHERE clause
  const whereConditions: string[] = [];
  const binds: any[] = [];
  
  if (filters.name) {
    whereConditions.push('recipient_name ILIKE ?');
    binds.push(`%${filters.name}%`);
  }
  
  if (filters.uei) {
    whereConditions.push('recipient_uei = ?');
    binds.push(filters.uei);
  }
  
  if (filters.duns) {
    whereConditions.push('duns = ?');
    binds.push(filters.duns);
  }
  
  if (filters.state_code) {
    whereConditions.push('recipient_state_code = ?');
    binds.push(filters.state_code);
  }
  
  if (filters.city) {
    whereConditions.push('recipient_city_name ILIKE ?');
    binds.push(`%${filters.city}%`);
  }
  
  if (filters.min_award_amount) {
    whereConditions.push('total_award_amount >= ?');
    binds.push(filters.min_award_amount);
  }
  
  if (filters.max_award_amount) {
    whereConditions.push('total_award_amount <= ?');
    binds.push(filters.max_award_amount);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;
  
  const query = `
    SELECT 
      recipient_hash,
      recipient_name,
      recipient_unique_id,
      recipient_uei,
      duns,
      recipient_city_name,
      recipient_state_code,
      total_award_amount,
      award_count,
      last_12_months_amount
    FROM recipient_lookup
    ${whereClause}
    ORDER BY ${filters.sort_by} ${filters.sort_order}
    LIMIT ${filters.limit} OFFSET ${offset}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM recipient_lookup
    ${whereClause}
  `;
  
  const [results, countResults] = await Promise.all([
    snowflakeService.executeQuery<Recipient>(query, binds, { useCache: true }),
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
  
  const response: ApiResponse<Recipient[]> = {
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

// GET /api/v1/recipients/:id - Get specific recipient details
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const recipientId = req.params.id; // Can be hash, UEI, or DUNS
  
  // Try to find by different identifiers
  const query = `
    SELECT *
    FROM recipient_lookup
    WHERE recipient_hash = ? 
       OR recipient_uei = ? 
       OR duns = ?
       OR recipient_unique_id = ?
  `;
  
  const result = await snowflakeService.executeQuery<Recipient>(
    query, 
    [recipientId, recipientId, recipientId, recipientId], 
    { useCache: true }
  );
  
  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RECIPIENT_NOT_FOUND',
        message: `Recipient with ID ${recipientId} not found`,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const response: ApiResponse<Recipient> = {
    success: true,
    data: result.rows[0],
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/recipients/:id/profile - Get detailed recipient profile
router.get('/:id/profile', asyncHandler(async (req: Request, res: Response) => {
  const recipientId = req.params.id;
  
  const query = `
    SELECT *
    FROM recipient_profile
    WHERE recipient_hash = ? 
       OR recipient_uei = ? 
       OR duns = ?
  `;
  
  const result = await snowflakeService.executeQuery(
    query, 
    [recipientId, recipientId, recipientId], 
    { useCache: true }
  );
  
  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RECIPIENT_PROFILE_NOT_FOUND',
        message: `Recipient profile with ID ${recipientId} not found`,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const response: ApiResponse<any> = {
    success: true,
    data: result.rows[0],
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/recipients/:id/awards - Get awards for specific recipient
router.get('/:id/awards', asyncHandler(async (req: Request, res: Response) => {
  const recipientId = req.params.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const offset = (page - 1) * limit;
  
  const query = `
    SELECT 
      award_id,
      recipient_name,
      agency_name,
      total_obligation,
      date_signed,
      award_type,
      award_description,
      fiscal_year
    FROM awards
    WHERE recipient_unique_id = ? 
       OR recipient_uei = ?
    ORDER BY total_obligation DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM awards
    WHERE recipient_unique_id = ? 
       OR recipient_uei = ?
  `;
  
  const [results, countResults] = await Promise.all([
    snowflakeService.executeQuery(query, [recipientId, recipientId], { useCache: true }),
    snowflakeService.executeQuery<{ TOTAL: number }>(countQuery, [recipientId, recipientId], { useCache: true })
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
      recipientId,
      executionTime: results.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/recipients/top - Top recipients by total awards
router.get('/top', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const fiscalYear = req.query.fiscal_year as string;
  const metric = req.query.metric as string || 'total_award_amount'; // or 'award_count'
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE last_12_months_amount IS NOT NULL';
  }
  
  const validMetrics = ['total_award_amount', 'award_count', 'last_12_months_amount'];
  const sortBy = validMetrics.includes(metric) ? metric : 'total_award_amount';
  
  const query = `
    SELECT 
      recipient_name,
      recipient_uei,
      recipient_state_code,
      recipient_city_name,
      total_award_amount,
      award_count,
      last_12_months_amount
    FROM recipient_lookup
    ${whereClause}
    ORDER BY ${sortBy} DESC NULLS LAST
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
      metric: sortBy,
      fiscal_year: fiscalYear,
      limit
    }
  };
  
  res.json(response);
}));

// GET /api/v1/recipients/summary/by-state - Recipients summary by state
router.get('/summary/by-state', asyncHandler(async (req: Request, res: Response) => {
  const query = `
    SELECT 
      recipient_state_code,
      COUNT(*) as recipient_count,
      SUM(total_award_amount) as total_award_amount,
      AVG(total_award_amount) as avg_award_amount,
      SUM(award_count) as total_awards
    FROM recipient_lookup
    WHERE recipient_state_code IS NOT NULL
    GROUP BY recipient_state_code
    ORDER BY total_award_amount DESC
  `;
  
  const result = await snowflakeService.executeQuery(query, [], { 
    useCache: true, 
    cacheTTL: 3600 // 1 hour cache
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      aggregation: 'by_state'
    }
  };
  
  res.json(response);
}));

export default router;

