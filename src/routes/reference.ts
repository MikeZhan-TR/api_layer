import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { asyncHandler } from '../middleware/errorHandler';
import { NAICSCode, PSCCode, GeographicData, FederalAccount, ApiResponse } from '../types/usaspending';

const router = Router();

// GET /api/v1/reference/naics - NAICS codes
router.get('/naics', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string;
  const code = req.query.code as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (code) {
    whereClause = 'WHERE naics_code = ?';
    binds.push(code);
  } else if (search) {
    whereClause = 'WHERE naics_description ILIKE ? OR naics_code LIKE ?';
    binds.push(`%${search}%`, `${search}%`);
  }
  
  const query = `
    SELECT 
      naics_code,
      naics_description,
      year
    FROM naics
    ${whereClause}
    ORDER BY naics_code
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery<NAICSCode>(query, binds, { 
    useCache: true, 
    cacheTTL: 3600 
  });
  
  const response: ApiResponse<NAICSCode[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      search,
      code
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/psc - Product Service Codes
router.get('/psc', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string;
  const code = req.query.code as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (code) {
    whereClause = 'WHERE psc_code = ?';
    binds.push(code);
  } else if (search) {
    whereClause = 'WHERE psc_description ILIKE ? OR psc_code LIKE ?';
    binds.push(`%${search}%`, `${search}%`);
  }
  
  const query = `
    SELECT 
      psc_code,
      psc_description
    FROM psc
    ${whereClause}
    ORDER BY psc_code
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery<PSCCode>(query, binds, { 
    useCache: true, 
    cacheTTL: 3600 
  });
  
  const response: ApiResponse<PSCCode[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      search,
      code
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/states - State reference data
router.get('/states', asyncHandler(async (req: Request, res: Response) => {
  const query = `
    SELECT 
      state_code,
      state_name
    FROM state_data
    ORDER BY state_name
  `;
  
  const result = await snowflakeService.executeQuery<GeographicData>(query, [], { 
    useCache: true, 
    cacheTTL: 86400 // 24 hours
  });
  
  const response: ApiResponse<GeographicData[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/federal-accounts - Federal account reference
router.get('/federal-accounts', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string;
  const agencyCode = req.query.agency_code as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  
  const whereConditions: string[] = [];
  const binds: any[] = [];
  
  if (search) {
    whereConditions.push('account_title ILIKE ?');
    binds.push(`%${search}%`);
  }
  
  if (agencyCode) {
    whereConditions.push('agency_identifier = ?');
    binds.push(agencyCode);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  
  const query = `
    SELECT 
      federal_account_code,
      account_title,
      agency_identifier,
      main_account_code
    FROM federal_account
    ${whereClause}
    ORDER BY account_title
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery<FederalAccount>(query, binds, { 
    useCache: true, 
    cacheTTL: 3600 
  });
  
  const response: ApiResponse<FederalAccount[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      search,
      agencyCode
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/object-classes - Budget object classes
router.get('/object-classes', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (search) {
    whereClause = 'WHERE object_class_name ILIKE ? OR object_class_code LIKE ?';
    binds.push(`%${search}%`, `${search}%`);
  }
  
  const query = `
    SELECT 
      object_class_code,
      object_class_name
    FROM object_class
    ${whereClause}
    ORDER BY object_class_code
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 3600 
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      search
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/cfda - Catalog of Federal Domestic Assistance
router.get('/cfda', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string;
  const programNumber = req.query.program_number as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  
  let whereClause = '';
  const binds: any[] = [];
  
  if (programNumber) {
    whereClause = 'WHERE program_number = ?';
    binds.push(programNumber);
  } else if (search) {
    whereClause = 'WHERE program_title ILIKE ? OR program_number LIKE ?';
    binds.push(`%${search}%`, `${search}%`);
  }
  
  const query = `
    SELECT 
      program_number,
      program_title,
      popular_name,
      federal_agency,
      authorization,
      objectives,
      types_of_assistance
    FROM references_cfda
    ${whereClause}
    ORDER BY program_number
    LIMIT ${limit}
  `;
  
  const result = await snowflakeService.executeQuery(query, binds, { 
    useCache: true, 
    cacheTTL: 3600 
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      search,
      programNumber
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/award-types - Award type definitions
router.get('/award-types', asyncHandler(async (req: Request, res: Response) => {
  const query = `
    SELECT DISTINCT
      award_type,
      award_type_code
    FROM awards
    WHERE award_type IS NOT NULL
    ORDER BY award_type
  `;
  
  const result = await snowflakeService.executeQuery(query, [], { 
    useCache: true, 
    cacheTTL: 86400 // 24 hours
  });
  
  const response: ApiResponse<any[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

// GET /api/v1/reference/fiscal-years - Available fiscal years
router.get('/fiscal-years', asyncHandler(async (req: Request, res: Response) => {
  const query = `
    SELECT DISTINCT
      fiscal_year
    FROM awards
    WHERE fiscal_year IS NOT NULL
    ORDER BY fiscal_year DESC
  `;
  
  const result = await snowflakeService.executeQuery(query, [], { 
    useCache: true, 
    cacheTTL: 86400 // 24 hours
  });
  
  const response: ApiResponse<{ FISCAL_YEAR: number }[]> = {
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));

export default router;

