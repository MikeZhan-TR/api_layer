# API Layer

A high-performance TypeScript API layer that integrates **Lovable frontend**, **Supabase backend**, and **Snowflake data warehouse** with government spending and contract opportunities data.

## 🎯 **Project Overview**

This API serves as the middleware layer connecting:
- **Frontend**: Lovable (TypeScript) - User interface and interactions
- **Backend**: Supabase - Authentication, user management, app data
- **Data Warehouse**: Snowflake - Government spending and contract opportunities data

## 📊 **Data Coverage**

- **Government Contract Opportunities** - SAM.gov contract data with advanced filtering
- **Defense Budget Allocations** - Budget data with fiscal year analysis
- **USAspending Awards** - 134K+ award records with full transaction history
- **Recipient Profiles** - 18M+ recipient records with detailed information
- **Transaction Data** - 747K+ transaction records with financial details
- **Geographic Summaries** - State and location-based spending analysis

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Lovable        │    │  Supabase       │    │  Snowflake      │
│  Frontend       │◄──►│  Backend        │    │  Data Warehouse │
│  (TypeScript)   │    │  (Auth/Users)   │    │  (Government)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  API Layer      │
                    │  (This Project) │
                    │  Express + TS   │
                    └─────────────────┘
```

## 🚀 **Quick Start**

### **1. Installation**
```bash
git clone https://github.com/MikeZhan-TR/api_layer.git
cd api_layer
npm install
```

### **2. Environment Setup**
Create a `.env` file with the following configuration:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Snowflake Configuration
SNOWFLAKE_ACCOUNT=your-account-identifier
SNOWFLAKE_USERNAME=your-username
SNOWFLAKE_PASSWORD=your-password
SNOWFLAKE_DATABASE=FOUNDRY
SNOWFLAKE_SCHEMA=API_SCHEMA
SNOWFLAKE_ROLE=DEV_API_ROLE

# Supabase Configuration (Optional - for authentication)
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
```

### **3. Development**
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

### **4. Production**
```bash
npm run build
npm start
```

## 📋 **API Endpoints**

### **🔍 Contract Opportunities Endpoints**

#### **GET /api/v1/opportunities**
Search government contract opportunities with advanced filtering.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `page_size` (number): Results per page (default: 10, max: 1000)
- `search_keywords` (string): Search terms (comma-separated)
- `filters` (JSON string): Advanced filter object

**Example Requests:**

```bash
# Basic search
curl "http://localhost:3001/api/v1/opportunities?page=1&page_size=10"

# Search with keywords
curl "http://localhost:3001/api/v1/opportunities?search_keywords=defense,software&page=1&page_size=20"

# Filter by department
curl "http://localhost:3001/api/v1/opportunities?filters=%7B%22Department/Ind.Agency%22:%5B%22DEPT%20OF%20DEFENSE%22%5D%7D"
```

#### **POST /api/v1/opportunities**
Advanced opportunities search with complex filters.

**Request Body:**
```json
{
  "page": 1,
  "page_size": 50,
  "search_keywords": "artificial intelligence, machine learning",
  "filters": {
    "Department/Ind.Agency": ["DEPT OF DEFENSE", "GENERAL SERVICES ADMINISTRATION"],
    "TYPE": ["Combined Synopsis/Solicitation"],
    "POPSTATE": ["VA", "CA", "TX"],
    "ACTIVE": true,
    "exact_values": {
      "AWARD$": {"operator": ">=", "value": "5000000"},
      "PRIMARYCONTACTEMAIL": {"operator": "IS_NOT_NULL"}
    },
    "dataAvailability": ["PRIMARYCONTACTEMAIL", "PRIMARYCONTACTPHONE"],
    "operator": "AND"
  }
}
```

**Advanced Filter Options:**

1. **Simple Filters:**
```json
{
  "filters": {
    "ACTIVE": true,
    "POPSTATE": ["VA", "CA", "TX"],
    "Department/Ind.Agency": ["DEPT OF DEFENSE"]
  }
}
```

2. **Range Filters:**
```json
{
  "filters": {
    "AWARD$Min": "1000000",
    "AWARD$Max": "10000000"
  }
}
```

3. **Exact Value Filters:**
```json
{
  "filters": {
    "exact_values": {
      "TITLE": {"operator": "CONTAINS", "value": "software development"},
      "AWARD$": {"operator": ">=", "value": "1000000"},
      "ACTIVE": true,
      "PRIMARYCONTACTEMAIL": {"operator": "IS_NOT_NULL"}
    }
  }
}
```

4. **Data Availability Filters:**
```json
{
  "filters": {
    "dataAvailability": ["PRIMARYCONTACTEMAIL", "PRIMARYCONTACTPHONE", "AWARD$"]
  }
}
```

5. **Search Keywords:**
```json
{
  "search_keywords": "defense research AI, -legacy software, autonomous systems"
}
```

#### **GET /api/v1/opportunities/schema**
Get table schema information for the opportunities table.

```bash
curl "http://localhost:3001/api/v1/opportunities/schema"
```

**Response:**
```json
{
  "table": "FOUNDRY.SAM_CONTRACTS.RAW_CSV",
  "columns": [
    {
      "COLUMN_NAME": "NOTICEID",
      "DATA_TYPE": "TEXT",
      "IS_NULLABLE": "YES",
      "ORDINAL_POSITION": 1
    },
    {
      "COLUMN_NAME": "TITLE",
      "DATA_TYPE": "TEXT",
      "IS_NULLABLE": "YES",
      "ORDINAL_POSITION": 2
    }
    // ... more columns
  ],
  "total_columns": 47
}
```

### **💰 Budget Endpoints**

#### **GET /api/v1/budget**
Get defense budget allocation data with advanced filtering.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `page_size` (number): Results per page (default: 10, max: 1000)
- `search_keywords` (string): Search terms
- `filters` (JSON string): Advanced filter object

**Example Requests:**

```bash
# Basic budget data
curl "http://localhost:3001/api/v1/budget?page=1&page_size=20"

# Filter by fiscal year
curl "http://localhost:3001/api/v1/budget?filters=%7B%22FISCAL_YEAR%22:%5B2024,2025%5D%7D"
```

#### **POST /api/v1/budget**
Advanced budget search with complex filters.

**Request Body:**
```json
{
  "page": 1,
  "page_size": 100,
  "search_keywords": "defense, research",
  "filters": {
    "FISCAL_YEAR": [2024, 2025],
    "AMOUNT_KMin": 1000,
    "AMOUNT_KMax": 50000,
    "exact_values": {
      "CATEGORY": {"operator": "CONTAINS", "value": "defense"}
    }
  }
}
```

#### **GET /api/v1/budget/summary**
Get budget summary by fiscal year.

```bash
curl "http://localhost:3001/api/v1/budget/summary"
curl "http://localhost:3001/api/v1/budget/summary?fiscal_year=2024"
```

**Response:**
```json
{
  "success": true,
  "summary": [
    {
      "FISCAL_YEAR": 2024,
      "TOTAL_AMOUNT_K": 1500000,
      "TOTAL_RECORDS": 2500
    }
  ]
}
```

#### **GET /api/v1/budget/schema**
Get table schema information for the budget table.

```bash
curl "http://localhost:3001/api/v1/budget/schema"
```

### **🏆 Awards Endpoints**

#### **GET /api/v1/awards**
Search and filter government awards.

**Query Parameters:**
- `fiscal_year` (number|array): Filter by fiscal year(s)
- `agency_code` (string|array): Filter by agency code(s)
- `state_code` (string|array): Filter by state code(s)
- `award_type` (string|array): Filter by award type(s)
- `recipient_name` (string): Search recipient name
- `naics_code` (string|array): Filter by NAICS code(s)
- `psc_code` (string|array): Filter by PSC code(s)
- `min_amount` (number): Minimum award amount
- `max_amount` (number): Maximum award amount
- `date_from` (string): Start date (YYYY-MM-DD)
- `date_to` (string): End date (YYYY-MM-DD)
- `keywords` (string): Search keywords
- `sort_by` (string): Sort field (total_obligation, date_signed, recipient_name, agency_name)
- `sort_order` (string): Sort order (asc, desc)
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 1000)

**Example Requests:**

```bash
# Search awards by fiscal year and amount
curl "http://localhost:3001/api/v1/awards?fiscal_year=2024&min_amount=1000000&state_code=CA&page=1&limit=50"

# Search by recipient name
curl "http://localhost:3001/api/v1/awards?recipient_name=Microsoft&sort_by=total_obligation&sort_order=desc"

# Search by keywords
curl "http://localhost:3001/api/v1/awards?keywords=defense&agency_code=17&limit=20"
```

#### **GET /api/v1/awards/:id**
Get specific award details.

```bash
curl "http://localhost:3001/api/v1/awards/12345"
```

#### **GET /api/v1/awards/:id/transactions**
Get transactions for a specific award.

```bash
curl "http://localhost:3001/api/v1/awards/12345/transactions?page=1&limit=50"
```

#### **GET /api/v1/awards/summary/by-agency**
Get awards summary by agency (rate limited).

```bash
curl "http://localhost:3001/api/v1/awards/summary/by-agency?fiscal_year=2024&limit=20"
```

### **💳 Transaction Endpoints**

#### **GET /api/v1/transactions**
Search and filter transaction data.

**Query Parameters:**
- `award_id` (string): Filter by award ID
- `fiscal_year` (number|array): Filter by fiscal year(s)
- `agency_code` (string|array): Filter by agency code(s)
- `action_type` (string|array): Filter by action type(s)
- `min_amount` (number): Minimum transaction amount
- `max_amount` (number): Maximum transaction amount
- `date_from` (string): Start date (YYYY-MM-DD)
- `date_to` (string): End date (YYYY-MM-DD)
- `keywords` (string): Search keywords
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 1000)

**Example Requests:**

```bash
# Search transactions by award
curl "http://localhost:3001/api/v1/transactions?award_id=12345&page=1&limit=100"

# Search by amount range
curl "http://localhost:3001/api/v1/transactions?min_amount=100000&max_amount=1000000&fiscal_year=2024"
```

### **🏢 Recipient Endpoints**

#### **GET /api/v1/recipients**
Search and filter recipient data.

**Query Parameters:**
- `name` (string): Search recipient name
- `state` (string|array): Filter by state(s)
- `city` (string): Filter by city
- `zipcode` (string): Filter by zip code
- `naics_code` (string|array): Filter by NAICS code(s)
- `business_types` (string|array): Filter by business type(s)
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 1000)

**Example Requests:**

```bash
# Search recipients by name
curl "http://localhost:3001/api/v1/recipients?name=Microsoft&page=1&limit=20"

# Search by location
curl "http://localhost:3001/api/v1/recipients?state=CA&city=San%20Francisco"
```

### **🏛️ Agency Endpoints**

#### **GET /api/v1/agencies**
Get government agency information.

**Query Parameters:**
- `name` (string): Search agency name
- `code` (string|array): Filter by agency code(s)
- `tier` (string|array): Filter by agency tier(s)
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 1000)

**Example Requests:**

```bash
# Search agencies by name
curl "http://localhost:3001/api/v1/agencies?name=Defense&page=1&limit=20"

# Filter by tier
curl "http://localhost:3001/api/v1/agencies?tier=Department"
```

### **📊 Spending Endpoints**

#### **GET /api/v1/spending**
Get spending summaries and analytics.

**Query Parameters:**
- `fiscal_year` (number|array): Filter by fiscal year(s)
- `agency_code` (string|array): Filter by agency code(s)
- `state_code` (string|array): Filter by state code(s)
- `award_type` (string|array): Filter by award type(s)
- `group_by` (string): Group results by (agency, state, fiscal_year, award_type)
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 1000)

**Example Requests:**

```bash
# Spending by state
curl "http://localhost:3001/api/v1/spending?group_by=state&fiscal_year=2024"

# Spending by agency
curl "http://localhost:3001/api/v1/spending?group_by=agency&fiscal_year=2024&limit=20"
```

### **📚 Reference Endpoints**

#### **GET /api/v1/reference**
Get reference data (NAICS, PSC, etc.).

**Query Parameters:**
- `type` (string): Reference type (naics, psc, agency, state)
- `code` (string): Filter by code
- `description` (string): Search description
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 1000)

**Example Requests:**

```bash
# Get NAICS codes
curl "http://localhost:3001/api/v1/reference?type=naics&page=1&limit=100"

# Search PSC codes
curl "http://localhost:3001/api/v1/reference?type=psc&description=software"
```

### **🔍 Search Endpoints**

#### **GET /api/v1/search**
Universal search across all data types.

**Query Parameters:**
- `q` (string): Search query
- `type` (string): Search type (all, awards, recipients, agencies, transactions)
- `fiscal_year` (number): Filter by fiscal year
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 20, max: 100)

**Example Requests:**

```bash
# Universal search
curl "http://localhost:3001/api/v1/search?q=defense&type=all&limit=20"

# Search specific type
curl "http://localhost:3001/api/v1/search?q=Microsoft&type=recipients&limit=10"
```

### **🏥 Health Endpoints**

#### **GET /health**
Basic health check (no authentication required).

```bash
curl "http://localhost:3001/health"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

## 🔐 **Authentication**

### **Public Endpoints (No Auth Required)**
- `GET /health`
- `GET /api/v1/opportunities/*`
- `GET /api/v1/budget/*`

### **Protected Endpoints (Auth Required)**
All other endpoints require Supabase authentication:

```javascript
// Request headers
Authorization: Bearer <supabase-jwt-token>
```

### **User Context**
Authenticated requests include user context:
- User ID and email
- Role and permissions
- Subscription tier (free/pro/enterprise)
- Rate limiting information

## ⚡ **Performance Features**

### **Caching**
- **In-memory cache** with configurable TTL
- **Query result caching** for expensive operations
- **Reference data caching** (24 hour TTL)

### **Rate Limiting**
- **Tiered rate limits** based on subscription
- **Strict limits** for expensive operations
- **IP-based fallback** for unauthenticated requests

### **Query Optimization**
- **Snowflake connection pooling**
- **Prepared statement bindings**
- **Pagination** for large result sets
- **Selective field projection**

## 🛡️ **Security**

### **Authentication & Authorization**
- **Supabase JWT verification** (for protected endpoints)
- **Role-based access control (RBAC)**
- **Permission-based access control**
- **Subscription tier enforcement**

### **Data Security**
- **SQL injection prevention** with parameterized queries
- **Input validation** with Zod schemas
- **CORS configuration**
- **Helmet.js security headers**

### **Rate Limiting**
```typescript
// Subscription-based limits
free: 50 requests / 15 minutes
pro: 200 requests / 15 minutes  
enterprise: 1000 requests / 15 minutes
```

## 📊 **Response Format**

All API responses follow a consistent format:

### **Success Response**
```json
{
  "success": true,
  "data": [...],
  "total_count": 1500,
  "page": 1,
  "page_size": 50,
  "total_pages": 30,
  "has_next": true,
  "has_previous": false,
  "metadata": {
    "executionTime": 150,
    "filters": {...}
  }
}
```

### **Error Response**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid filter parameters",
    "details": {...},
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## 🧪 **Testing**

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linting
npm run lint

# Format code
npm run format
```

## 📈 **Deployment**

### **Environment Variables**
Production deployment requires:
- Snowflake production credentials
- Supabase production keys (if using authentication)
- Proper CORS origins
- Rate limiting configuration

### **Docker Support**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## 📚 **Documentation**

### **Data Documentation**
- [`docs/USASPENDING_DATA_ANALYSIS.md`](docs/USASPENDING_DATA_ANALYSIS.md) - Complete data analysis
- [`docs/COMPLETE_DATA_DICTIONARY.md`](docs/COMPLETE_DATA_DICTIONARY.md) - All tables documented
- [`docs/SNOWFLAKE_INTEGRATION_SETUP.sql`](docs/SNOWFLAKE_INTEGRATION_SETUP.sql) - Database setup scripts

### **API Documentation**
- OpenAPI/Swagger documentation (coming soon)
- Postman collection (coming soon)

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎊 **Features**

This API layer provides comprehensive access to government data:

- ✅ **Advanced Contract Opportunities Search** with complex filtering
- ✅ **Defense Budget Analysis** with fiscal year summaries
- ✅ **Government Awards Database** with full transaction history
- ✅ **Recipient Profiles** with detailed business information
- ✅ **Spending Analytics** with geographic and agency breakdowns
- ✅ **Reference Data** for NAICS, PSC, and agency codes
- ✅ **Universal Search** across all data types
- ✅ **Enterprise-grade Performance** with caching and rate limiting

**Ready for building the next generation of government transparency applications!** 🚀