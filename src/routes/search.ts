import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { strictRateLimiterMiddleware } from '../middleware/rateLimiter';
import { ApiResponse, PaginationInfo } from '../types/usaspending';
import { z } from 'zod';

const router = Router();

const universalSearchSchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  type: z.enum(['all', 'awards', 'recipients', 'agencies']).default('all'),
  fiscal_year: z.number().optional(),
  min_amount: z.number().min(0).optional(),
  max_amount: z.number().min(0).optional(),
  sort_by: z.enum(['relevance', 'amount', 'date']).default('relevance'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20)
});

// GET /api/v1/search - Universal search endpoint
router.get('/', strictRateLimiterMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const params = universalSearchSchema.parse(req.query);
  const searchTerm = `%${params.q}%`;
  const offset = (params.page - 1) * params.limit;
  
  const results: any = {
    awards: [],
    recipients: [],
    agencies: [],
    total: 0
  };
  
  // Search Awards
  if (params.type === 'all' || params.type === 'awards') {
    const whereConditions = [
      '(award_description ILIKE ? OR recipient_name ILIKE ? OR agency_name ILIKE ?)'
    ];
    const binds = [searchTerm, searchTerm, searchTerm];
    
    if (params.fiscal_year) {
      whereConditions.push('fiscal_year = ?');
      binds.push(String(params.fiscal_year));
    }
    
    if (params.min_amount) {
      whereConditions.push('total_obligation >= ?');
      binds.push(String(params.min_amount));
    }
    
    if (params.max_amount) {
      whereConditions.push('total_obligation <= ?');
      binds.push(String(params.max_amount));
    }
    
    const orderBy = params.sort_by === 'amount' ? 'total_obligation' : 
                   params.sort_by === 'date' ? 'date_signed' : 'total_obligation';
    
    const awardsQuery = `
      SELECT 
        'award' as result_type,
        award_id,
        recipient_name,
        agency_name,
        total_obligation,
        date_signed,
        award_description,
        fiscal_year
      FROM awards
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${orderBy} ${params.sort_order} NULLS LAST
      LIMIT ${params.type === 'awards' ? params.limit : Math.min(params.limit / 3, 10)}
      OFFSET ${params.type === 'awards' ? offset : 0}
    `;
    
    const awardsResult = await snowflakeService.executeQuery(awardsQuery, binds, { useCache: true });
    results.awards = awardsResult.rows;
  }
  
  // Search Recipients
  if (params.type === 'all' || params.type === 'recipients') {
    const recipientsQuery = `
      SELECT 
        'recipient' as result_type,
        recipient_name,
        recipient_uei,
        recipient_state_code,
        recipient_city_name,
        total_award_amount,
        award_count
      FROM recipient_lookup
      WHERE recipient_name ILIKE ?
      ORDER BY total_award_amount DESC NULLS LAST
      LIMIT ${params.type === 'recipients' ? params.limit : Math.min(params.limit / 3, 10)}
      OFFSET ${params.type === 'recipients' ? offset : 0}
    `;
    
    const recipientsResult = await snowflakeService.executeQuery(recipientsQuery, [searchTerm], { useCache: true });
    results.recipients = recipientsResult.rows;
  }
  
  // Search Agencies
  if (params.type === 'all' || params.type === 'agencies') {
    const agenciesQuery = `
      SELECT 
        'agency' as result_type,
        agency_name,
        agency_code,
        agency_abbreviation,
        agency_type
      FROM agencies
      WHERE agency_name ILIKE ? OR agency_abbreviation ILIKE ?
      ORDER BY agency_name
      LIMIT ${params.type === 'agencies' ? params.limit : Math.min(params.limit / 3, 10)}
      OFFSET ${params.type === 'agencies' ? offset : 0}
    `;
    
    const agenciesResult = await snowflakeService.executeQuery(agenciesQuery, [searchTerm, searchTerm], { useCache: true });
    results.agencies = agenciesResult.rows;
  }
  
  // Combine results for 'all' search
  let combinedResults: any[] = [];
  let totalCount = 0;
  
  if (params.type === 'all') {
    combinedResults = [
      ...results.awards,
      ...results.recipients,
      ...results.agencies
    ];
    totalCount = combinedResults.length;
  } else {
    combinedResults = results[params.type];
    
    // Get total count for pagination
    if (params.type === 'awards') {
      const countQuery = `
        SELECT COUNT(*) as total
        FROM awards
        WHERE (award_description ILIKE ? OR recipient_name ILIKE ? OR agency_name ILIKE ?)
        ${params.fiscal_year ? 'AND fiscal_year = ?' : ''}
        ${params.min_amount ? 'AND total_obligation >= ?' : ''}
        ${params.max_amount ? 'AND total_obligation <= ?' : ''}
      `;
      
      const countBinds = [searchTerm, searchTerm, searchTerm];
      if (params.fiscal_year) countBinds.push(String(params.fiscal_year));
      if (params.min_amount) countBinds.push(String(params.min_amount));
      if (params.max_amount) countBinds.push(String(params.max_amount));
      
      const countResult = await snowflakeService.executeQuery<{ TOTAL: number }>(countQuery, countBinds, { useCache: true });
      totalCount = countResult.rows[0]?.TOTAL || 0;
    }
  }
  
  const totalPages = Math.ceil(totalCount / params.limit);
  
  const pagination: PaginationInfo = {
    page: params.page,
    limit: params.limit,
    total: totalCount,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1
  };
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: combinedResults,
    pagination: params.type !== 'all' ? pagination : {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false
    },
    metadata: {
      query: params.q,
      searchType: params.type,
      resultCounts: {
        awards: results.awards.length,
        recipients: results.recipients.length,
        agencies: results.agencies.length,
        total: combinedResults.length
      }
    }
  };
  
  res.json(response);
}));

// GET /api/v1/search/autocomplete - Autocomplete suggestions
router.get('/autocomplete', asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const type = req.query.type as string || 'all';
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
  
  if (!query || query.length < 2) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY',
        message: 'Query must be at least 2 characters long',
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const searchTerm = `${query}%`;
  const suggestions: any[] = [];
  
  // Recipient suggestions
  if (type === 'all' || type === 'recipients') {
    const recipientQuery = `
      SELECT 
        'recipient' as type,
        recipient_name as value,
        recipient_uei as id
      FROM recipient_lookup
      WHERE recipient_name ILIKE ?
      ORDER BY total_award_amount DESC NULLS LAST
      LIMIT ${Math.min(limit, 5)}
    `;
    
    const recipientResult = await snowflakeService.executeQuery(recipientQuery, [searchTerm], { 
      useCache: true, 
      cacheTTL: 600 
    });
    suggestions.push(...recipientResult.rows);
  }
  
  // Agency suggestions
  if (type === 'all' || type === 'agencies') {
    const agencyQuery = `
      SELECT 
        'agency' as type,
        agency_name as value,
        agency_code as id
      FROM agencies
      WHERE agency_name ILIKE ? OR agency_abbreviation ILIKE ?
      ORDER BY agency_name
      LIMIT ${Math.min(limit, 5)}
    `;
    
    const agencyResult = await snowflakeService.executeQuery(agencyQuery, [searchTerm, searchTerm], { 
      useCache: true, 
      cacheTTL: 600 
    });
    suggestions.push(...agencyResult.rows);
  }
  
  // Award description suggestions
  if (type === 'all' || type === 'awards') {
    const awardQuery = `
      SELECT DISTINCT
        'award' as type,
        SUBSTRING(award_description, 1, 100) as value,
        award_id as id
      FROM awards
      WHERE award_description ILIKE ?
      ORDER BY total_obligation DESC NULLS LAST
      LIMIT ${Math.min(limit, 5)}
    `;
    
    const awardResult = await snowflakeService.executeQuery(awardQuery, [searchTerm], { 
      useCache: true, 
      cacheTTL: 600 
    });
    suggestions.push(...awardResult.rows);
  }
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: suggestions.slice(0, limit),
    metadata: {
      query,
      type,
      count: suggestions.length
    }
  };
  
  res.json(response);
}));

// GET /api/v1/search/advanced - Advanced search with complex filters
router.get('/advanced', strictRateLimiterMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // This would implement more complex search logic
  // For now, redirect to the main search endpoint
  req.url = req.url.replace('/advanced', '');
  // Use the main search handler instead of router.handle
  return res.redirect(302, req.url);
}));

export default router;

