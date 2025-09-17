# API Development Guide

## 🎯 **Overview**

This guide provides comprehensive instructions for developing APIs using government spending and contract opportunities data in Snowflake. The API layer serves as middleware between your Lovable frontend, Supabase backend, and the data warehouse.

## 📊 **Data Architecture Understanding**

### **Available Data Sources**
- **83 tables** with 790+ million records
- **4 main schemas**: `int`, `raw`, `rpt`, `public`
- **29.38 GB** of government spending data
- **Complete business coverage** of USAspending database

### **High-Priority Tables for API Development**

#### **Core Award & Transaction APIs**
```sql
-- Primary award data (comprehensive)
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS LIMIT 5;

-- Optimized award search (134K+ records)
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.AWARD_SEARCH LIMIT 5;

-- Procurement transactions (optimized search table)
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.TRANSACTION_SEARCH_FPDS LIMIT 5;

-- Assistance transactions (optimized search table)  
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.TRANSACTION_SEARCH_FABS LIMIT 5;
```

#### **Entity & Recipient APIs**
```sql
-- Recipient directory (17M+ records)
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.RECIPIENT_LOOKUP LIMIT 5;

-- Recipient analytics (18M+ records)
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.RECIPIENT_PROFILE LIMIT 5;

-- Agency information
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.AGENCIES LIMIT 5;

-- Business entity validation
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.DUNS LIMIT 5;
```

#### **Geographic & Summary APIs**
```sql
-- Geographic summaries (1.5M+ records)
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.SUMMARY_STATE_VIEW LIMIT 5;

-- Geographic reference data
SELECT * FROM FOUNDRY.USASPENDING_SCHEMA.REF_CITY_COUNTY_STATE_CODE LIMIT 5;
```

## 🏗️ **API Development Patterns**

### **1. Basic CRUD Operations**

#### **GET Single Record**
```typescript
// GET /api/v1/awards/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const awardId = req.params.id;
  
  const query = `
    SELECT *
    FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
    WHERE award_id = ?
  `;
  
  const result = await snowflakeService.executeQuery<Award>(
    query, 
    [awardId], 
    { useCache: true }
  );
  
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
    data: result.rows[0],
    metadata: {
      executionTime: result.executionTime
    }
  };
  
  res.json(response);
}));
```

#### **GET List with Filtering & Pagination**
```typescript
// GET /api/v1/awards
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const filters = searchSchema.parse(req.query);
  
  // Build dynamic WHERE clause
  const whereConditions: string[] = [];
  const binds: any[] = [];
  
  if (filters.fiscal_year) {
    whereConditions.push('fiscal_year = ?');
    binds.push(filters.fiscal_year);
  }
  
  if (filters.min_amount) {
    whereConditions.push('total_obligation >= ?');
    binds.push(filters.min_amount);
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}` 
    : '';
    
  const offset = (filters.page - 1) * filters.limit;
  
  const query = `
    SELECT 
      award_id,
      recipient_name,
      agency_name,
      total_obligation,
      date_signed,
      fiscal_year
    FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
    ${whereClause}
    ORDER BY ${filters.sort_by} ${filters.sort_order}
    LIMIT ${filters.limit} OFFSET ${offset}
  `;
  
  const result = await snowflakeService.executeQuery<Award>(
    query, 
    binds, 
    { useCache: true }
  );
  
  // Include pagination info
  const response: ApiResponse<Award[]> = {
    success: true,
    data: result.rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: await getTotalCount(whereClause, binds),
      // ... other pagination fields
    },
    metadata: {
      executionTime: result.executionTime,
      filters: filters
    }
  };
  
  res.json(response);
}));
```

### **2. Aggregation & Analytics APIs**

#### **Summary Statistics**
```typescript
// GET /api/v1/spending/by-agency
router.get('/by-agency', asyncHandler(async (req: Request, res: Response) => {
  const fiscalYear = req.query.fiscal_year as string;
  
  const query = `
    SELECT 
      agency_name,
      agency_code,
      COUNT(*) as award_count,
      SUM(total_obligation) as total_spending,
      AVG(total_obligation) as avg_award_amount,
      COUNT(DISTINCT recipient_name) as recipient_count
    FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
    WHERE fiscal_year = ?
    GROUP BY agency_name, agency_code
    ORDER BY total_spending DESC
    LIMIT 50
  `;
  
  const result = await snowflakeService.executeQuery(
    query, 
    [parseInt(fiscalYear)], 
    { 
      useCache: true, 
      cacheTTL: 1800 // 30 minutes for aggregations
    }
  );
  
  res.json({
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      fiscalYear,
      aggregation: 'by_agency'
    }
  });
}));
```

#### **Time Series Analysis**
```typescript
// GET /api/v1/spending/trends/monthly
router.get('/trends/monthly', asyncHandler(async (req: Request, res: Response) => {
  const query = `
    SELECT 
      DATE_TRUNC('month', date_signed) as month,
      COUNT(*) as award_count,
      SUM(total_obligation) as total_spending,
      AVG(total_obligation) as avg_spending
    FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
    WHERE date_signed IS NOT NULL
      AND fiscal_year = ?
    GROUP BY DATE_TRUNC('month', date_signed)
    ORDER BY month
  `;
  
  const result = await snowflakeService.executeQuery(
    query, 
    [2024], 
    { useCache: true, cacheTTL: 1800 }
  );
  
  res.json({
    success: true,
    data: result.rows,
    metadata: {
      executionTime: result.executionTime,
      aggregation: 'monthly_trends'
    }
  });
}));
```

### **3. Complex Search APIs**

#### **Multi-Table Joins**
```typescript
// GET /api/v1/search/comprehensive
router.get('/comprehensive', asyncHandler(async (req: Request, res: Response) => {
  const searchTerm = req.query.q as string;
  
  const query = `
    SELECT 
      a.award_id,
      a.recipient_name,
      a.agency_name,
      a.total_obligation,
      r.recipient_state_code,
      r.total_award_amount as recipient_total,
      ag.agency_abbreviation
    FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS a
    LEFT JOIN FOUNDRY.USASPENDING_SCHEMA.RECIPIENT_LOOKUP r 
      ON a.recipient_unique_id = r.recipient_unique_id
    LEFT JOIN FOUNDRY.USASPENDING_SCHEMA.AGENCIES ag 
      ON a.agency_code = ag.agency_code
    WHERE (
      a.award_description ILIKE ? 
      OR a.recipient_name ILIKE ?
      OR ag.agency_name ILIKE ?
    )
    ORDER BY a.total_obligation DESC
    LIMIT 100
  `;
  
  const searchPattern = `%${searchTerm}%`;
  const result = await snowflakeService.executeQuery(
    query, 
    [searchPattern, searchPattern, searchPattern], 
    { useCache: true }
  );
  
  res.json({
    success: true,
    data: result.rows,
    metadata: {
      searchTerm,
      executionTime: result.executionTime,
      joinTables: ['awards', 'recipient_lookup', 'agencies']
    }
  });
}));
```

## ⚡ **Performance Optimization**

### **1. Query Optimization**

#### **Use Appropriate Indexes**
```sql
-- Leverage existing search tables for performance
-- Instead of: SELECT * FROM awards WHERE recipient_name ILIKE '%company%'
-- Use: SELECT * FROM award_search WHERE recipient_name ILIKE '%company%'
```

#### **Selective Column Projection**
```typescript
// Don't select all columns if not needed
const query = `
  SELECT 
    award_id,
    recipient_name,
    total_obligation,
    date_signed
  FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS  -- Not SELECT *
  WHERE fiscal_year = ?
`;
```

#### **Efficient Pagination**
```typescript
// Use LIMIT/OFFSET for pagination
const query = `
  SELECT award_id, recipient_name, total_obligation
  FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
  WHERE fiscal_year = ?
  ORDER BY total_obligation DESC
  LIMIT ${limit} OFFSET ${offset}
`;
```

### **2. Caching Strategy**

#### **Cache Configuration**
```typescript
// Short TTL for dynamic data
const dynamicResult = await snowflakeService.executeQuery(
  query, 
  binds, 
  { useCache: true, cacheTTL: 300 } // 5 minutes
);

// Long TTL for reference data
const referenceResult = await snowflakeService.executeQuery(
  query, 
  binds, 
  { useCache: true, cacheTTL: 86400 } // 24 hours
);
```

#### **Cache Key Strategy**
```typescript
// Custom cache keys for complex queries
const cacheKey = `awards:${fiscalYear}:${agencyCode}:${page}`;
const result = await snowflakeService.executeQuery(
  query, 
  binds, 
  { useCache: true, cacheKey, cacheTTL: 1800 }
);
```

### **3. Rate Limiting**

#### **Tiered Rate Limits**
```typescript
// Standard endpoints
router.get('/awards', rateLimiter, handler);

// Expensive operations
router.get('/awards/export', strictRateLimiterMiddleware, handler);

// Subscription-based limits
router.get('/analytics/advanced', tieredRateLimiter, handler);
```

## 🔐 **Security Best Practices**

### **1. Input Validation**
```typescript
import { z } from 'zod';

const searchSchema = z.object({
  fiscal_year: z.number().min(2000).max(2030).optional(),
  min_amount: z.number().min(0).optional(),
  max_amount: z.number().min(0).optional(),
  sort_by: z.enum(['total_obligation', 'date_signed']).default('total_obligation'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(1000).default(50)
});

// Use in route handler
const filters = searchSchema.parse(req.query);
```

### **2. SQL Injection Prevention**
```typescript
// ✅ GOOD: Parameterized queries
const query = `
  SELECT * FROM awards 
  WHERE fiscal_year = ? AND agency_code = ?
`;
const result = await snowflakeService.executeQuery(query, [2024, 'DOD']);

// ❌ BAD: String concatenation
const badQuery = `
  SELECT * FROM awards 
  WHERE fiscal_year = ${fiscalYear} AND agency_code = '${agencyCode}'
`;
```

### **3. Authentication & Authorization**
```typescript
// Require authentication
router.get('/sensitive-data', authMiddleware, handler);

// Require specific role
router.get('/admin-data', requireRole(['admin', 'analyst']), handler);

// Require subscription tier
router.get('/premium-analytics', requireSubscriptionTier('pro'), handler);
```

## 📊 **Common Query Patterns**

### **1. Top N Queries**
```sql
-- Top agencies by spending
SELECT 
  agency_name,
  SUM(total_obligation) as total_spending
FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
WHERE fiscal_year = 2024
GROUP BY agency_name
ORDER BY total_spending DESC
LIMIT 10;
```

### **2. Geographic Analysis**
```sql
-- Spending by state
SELECT 
  place_of_performance_state,
  COUNT(*) as award_count,
  SUM(total_obligation) as total_spending
FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
WHERE fiscal_year = 2024
GROUP BY place_of_performance_state
ORDER BY total_spending DESC;
```

### **3. Time Series Analysis**
```sql
-- Monthly spending trends
SELECT 
  DATE_TRUNC('month', date_signed) as month,
  SUM(total_obligation) as monthly_spending
FROM FOUNDRY.USASPENDING_SCHEMA.AWARDS
WHERE date_signed >= '2024-01-01'
GROUP BY DATE_TRUNC('month', date_signed)
ORDER BY month;
```

### **4. Recipient Analysis**
```sql
-- Top recipients with details
SELECT 
  r.recipient_name,
  r.recipient_state_code,
  r.total_award_amount,
  r.award_count,
  COUNT(a.award_id) as recent_awards
FROM FOUNDRY.USASPENDING_SCHEMA.RECIPIENT_LOOKUP r
LEFT JOIN FOUNDRY.USASPENDING_SCHEMA.AWARDS a 
  ON r.recipient_unique_id = a.recipient_unique_id 
  AND a.fiscal_year = 2024
GROUP BY r.recipient_name, r.recipient_state_code, r.total_award_amount, r.award_count
ORDER BY r.total_award_amount DESC
LIMIT 50;
```

## 🧪 **Testing Strategies**

### **1. Unit Tests**
```typescript
describe('Awards API', () => {
  test('should return award by ID', async () => {
    const mockResult = { rows: [{ award_id: '123', recipient_name: 'Test' }] };
    jest.spyOn(snowflakeService, 'executeQuery').mockResolvedValue(mockResult);
    
    const response = await request(app)
      .get('/api/v1/awards/123')
      .set('Authorization', 'Bearer test-token');
      
    expect(response.status).toBe(200);
    expect(response.body.data.award_id).toBe('123');
  });
});
```

### **2. Integration Tests**
```typescript
describe('Database Integration', () => {
  test('should connect to Snowflake', async () => {
    const isConnected = await snowflakeService.testConnection();
    expect(isConnected).toBe(true);
  });
  
  test('should execute query successfully', async () => {
    const result = await snowflakeService.executeQuery('SELECT 1 as test');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].TEST).toBe(1);
  });
});
```

## 🚀 **Deployment Considerations**

### **1. Environment Configuration**
```bash
# Development
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
CACHE_TTL_SECONDS=300
LOG_LEVEL=debug

# Production  
SNOWFLAKE_WAREHOUSE=PROD_WH
CACHE_TTL_SECONDS=1800
LOG_LEVEL=info
```

### **2. Monitoring & Alerting**
```typescript
// Add performance monitoring
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id
    });
  });
  
  next();
});
```

## 📈 **Scaling Recommendations**

### **1. Database Optimization**
- Use clustering keys on frequently filtered columns
- Implement materialized views for complex aggregations
- Consider partitioning for very large tables

### **2. API Optimization**
- Implement GraphQL for flexible data fetching
- Add response compression
- Use CDN for cacheable responses
- Implement API versioning

### **3. Infrastructure**
- Use load balancers for high availability
- Implement circuit breakers for external dependencies
- Add health checks for container orchestration
- Monitor memory usage and connection pools

## 🎯 **Next Steps**

1. **Implement Core Endpoints** - Start with awards, recipients, agencies
2. **Add Advanced Analytics** - Time series, geographic analysis
3. **Implement Search** - Full-text search across multiple tables
4. **Add Export Features** - CSV/Excel export with rate limiting
5. **Create Documentation** - OpenAPI/Swagger documentation
6. **Performance Testing** - Load testing with realistic data volumes

This comprehensive guide provides everything needed to build high-performance APIs on top of the complete USAspending dataset! 🚀

