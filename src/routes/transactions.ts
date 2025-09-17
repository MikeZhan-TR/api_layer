import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { Transaction, ApiResponse, PaginationInfo } from '../types/usaspending';
import { z } from 'zod';

const router = Router();

const transactionSearchSchema = z.object({
  transaction_type: z.enum(['procurement', 'assistance', 'all']).default('all'),
  fiscal_year: z.union([z.number(), z.array(z.number())]).optional(),
  agency_code: z.union([z.string(), z.array(z.string())]).optional(),
  award_id: z.string().optional(),
  min_amount: z.number().min(0).optional(),
  max_amount: z.number().min(0).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort_by: z.enum(['federal_action_obligation', 'action_date', 'award_id']).default('action_date'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(1000).default(50)
});

// GET /api/v1/transactions - Search transactions
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const filters = transactionSearchSchema.parse(req.query);
  
  // Determine which table to query based on transaction type
  let tableName = 'transaction_search';
  if (filters.transaction_type === 'procurement') {
    tableName = 'transaction_search_fpds';
  } else if (filters.transaction_type === 'assistance') {
    tableName = 'transaction_search_fabs';
  }
  
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
  
  if (filters.award_id) {
    whereConditions.push('award_id = ?');
    binds.push(filters.award_id);
  }
  
  if (filters.min_amount) {
    whereConditions.push('federal_action_obligation >= ?');
    binds.push(filters.min_amount);
  }
  
  if (filters.max_amount) {
    whereConditions.push('federal_action_obligation <= ?');
    binds.push(filters.max_amount);
  }
  
  if (filters.date_from) {
    whereConditions.push('action_date >= ?');
    binds.push(filters.date_from);
  }
  
  if (filters.date_to) {
    whereConditions.push('action_date <= ?');
    binds.push(filters.date_to);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;
  
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
      fiscal_year,
      recipient_name,
      agency_name
    FROM ${tableName}
    ${whereClause}
    ORDER BY ${filters.sort_by} ${filters.sort_order}
    LIMIT ${filters.limit} OFFSET ${offset}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM ${tableName}
    ${whereClause}
  `;
  
  const [results, countResults] = await Promise.all([
    snowflakeService.executeQuery<Transaction>(query, binds, { useCache: true }),
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
  
  const response: ApiResponse<Transaction[]> = {
    success: true,
    data: results.rows,
    pagination,
    metadata: {
      executionTime: results.executionTime,
      table: tableName,
      filters: filters
    }
  };
  
  res.json(response);
}));

// GET /api/v1/transactions/:id - Get specific transaction
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const transactionId = req.params.id;
  
  // Try to find in the universal transaction search table first
  const query = `
    SELECT *
    FROM transaction_search
    WHERE transaction_id = ?
  `;
  
  const result = await snowflakeService.executeQuery<Transaction>(query, [transactionId], { useCache: true });
  
  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: {
        code: 'TRANSACTION_NOT_FOUND',
        message: `Transaction with ID ${transactionId} not found`,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }
  
  const response: ApiResponse<Transaction> = {
    success: true,
    data: result.rows[0],
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/transactions/summary/by-type - Transaction summary by type
router.get('/summary/by-type', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      action_type,
      action_type_description,
      COUNT(*) as transaction_count,
      SUM(federal_action_obligation) as total_amount,
      AVG(federal_action_obligation) as avg_amount
    FROM transaction_search
    ${whereClause}
    GROUP BY action_type, action_type_description
    ORDER BY total_amount DESC
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
      fiscal_year: fiscalYear,
      aggregation: 'by_type'
    }
  };
  
  res.json(response);
}));

// GET /api/v1/transactions/summary/monthly - Monthly transaction trends
router.get('/summary/monthly', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  const transactionType = req.query.transaction_type as string || 'all';
  
  let tableName = 'transaction_search';
  if (transactionType === 'procurement') {
    tableName = 'transaction_search_fpds';
  } else if (transactionType === 'assistance') {
    tableName = 'transaction_search_fabs';
  }
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (fiscalYear) {
    whereClause = 'WHERE fiscal_year = ?';
    binds.push(parseInt(fiscalYear));
  }
  
  const query = `
    SELECT 
      DATE_TRUNC('month', action_date) as month,
      COUNT(*) as transaction_count,
      SUM(federal_action_obligation) as total_amount,
      AVG(federal_action_obligation) as avg_amount
    FROM ${tableName}
    ${whereClause}
    GROUP BY DATE_TRUNC('month', action_date)
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
      fiscal_year: fiscalYear,
      transaction_type: transactionType,
      aggregation: 'monthly'
    }
  };
  
  res.json(response);
}));

export default router;

