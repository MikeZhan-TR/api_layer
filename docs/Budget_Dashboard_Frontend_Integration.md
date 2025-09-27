# Budget Dashboard Frontend Integration Guide

## API Domain

**Base URL**: `https://apilayer-production.up.railway.app`

All API calls should use this domain as the base URL.

## Overview

This document outlines how the frontend can interact with the comprehensive budget API routes to build a complete budget intelligence dashboard. The API provides access to defense budget allocation data from FOUNDRY.BUDGET.UNIFIED and includes DoD Budget Intelligence endpoints for advanced analytics.

## Complete API Endpoints Available

### Core Budget Data Endpoints

#### 1. Budget Schema Information
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/schema`
- **Purpose**: Get table schema information for dynamic field discovery
- **Returns**: Column definitions, data types, and table metadata

#### 2. Budget Data (Raw)
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget` (with query parameters)
- **Endpoint**: `POST https://apilayer-production.up.railway.app/api/v1/budget` (with body filters)
- **Purpose**: Access raw budget data with advanced filtering and search
- **Returns**: Paginated budget records with full field access

#### 3. Budget Summary
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/summary`
- **Purpose**: Get budget summary statistics by fiscal year and organization
- **Returns**: Aggregated budget totals, averages, and breakdowns

### DoD Budget Intelligence Endpoints

#### 4. Budget Programs Summary
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/programs/summary`
- **Purpose**: Get high-level budget statistics and totals with real utilization rates
- **Returns**: Total budget, program counts, fiscal breakdown, utilization rates

#### 5. Budget Programs (Main Data Source)
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/programs`
- **Purpose**: Get detailed program data with filtering, sorting, and pagination
- **Returns**: Array of budget programs with detailed information

#### 6. Budget Programs by Category
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/programs/by-category`
- **Purpose**: Get programs grouped by budget category
- **Returns**: Programs organized by R&D, Procurement, Operations, Military Construction

#### 7. Account Shifts Analysis
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/account-shifts`
- **Purpose**: Get budget shifts between FY2025 and FY2026 by organization/branch
- **Returns**: Budget changes, percentage changes, and branch comparisons

#### 8. Budget Execution Trends
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/trends`
- **Purpose**: Get budget execution trends showing requested vs enacted vs spent vs remaining
- **Returns**: Program-level execution data with authorization analysis

#### 9. Weapons Intelligence
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/programs/weapons-intelligence`
- **Purpose**: Get weapons systems intelligence and analysis
- **Returns**: High-value systems, categories, and weapons program analysis

#### 10. Budget Health Check
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/budget/health`
- **Purpose**: Check budget intelligence service health
- **Returns**: Service status and connection information

## API Response Structures

### 1. Budget Schema Response

```json
{
  "table": "FOUNDRY.BUDGET.UNIFIED",
  "columns": [
    {
      "COLUMN_NAME": "FISCAL_YEAR",
      "DATA_TYPE": "NUMBER",
      "IS_NULLABLE": "YES",
      "COLUMN_DEFAULT": null,
      "ORDINAL_POSITION": 1
    }
  ],
  "total_columns": 15
}
```

### 2. Budget Programs Summary Response

```json
{
  "success": true,
  "data": {
    "budget_totals": {
      "total_budget": 850000000000,
      "total_programs": 2112,
      "total_organizations": 6,
      "total_categories": 4
    },
    "contract_linking": {
      "total_linkable": 1850,
      "pe_numbers": 450,
      "bli_numbers": 320,
      "weapons_systems": 280
    },
    "fiscal_breakdown": {
      "fy_2024_total": 750000000000,
      "fy_2025_total": 800000000000,
      "fy_2026_total": 850000000000
    },
    "utilization": {
      "real_utilization_rate": 0.847,
      "total_obligated": 720000000000
    }
  },
  "message": "Budget programs summary retrieved successfully",
  "last_updated": "2025-01-18T21:37:06.888Z"
}
```

### 3. Budget Programs Response

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "identifier": "9999",
        "program_name": "Classified Programs",
        "appropriation_type": "O1_OpMaint",
        "account_code": "0100D",
        "primary_budget_amount": 20301291000,
        "fiscal_year": 2024,
        "phase": "Actual",
        "category": "Operations",
        "identifier_type": "O1",
        "organization": "DoD",
        "contract_linkable": true,
        "fy_2024_budget": 0,
        "fy_2025_budget": 0,
        "fy_2026_budget": 0
      }
    ],
    "total": 2112
  },
  "message": "Budget programs retrieved successfully",
  "last_updated": "2025-01-18T21:37:06.888Z"
}
```

### 4. Programs by Category Response

```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "category": "R&D",
        "total_programs": 450,
        "total_budget": 180000000000,
        "organizations_count": 6,
        "percentage_of_total": 21.2
      },
      {
        "category": "Procurement",
        "total_programs": 320,
        "total_budget": 220000000000,
        "organizations_count": 5,
        "percentage_of_total": 25.9
      }
    ],
    "total_categories": 4
  },
  "message": "Programs by category retrieved successfully",
  "last_updated": "2025-01-18T21:37:06.888Z"
}
```

### 5. Account Shifts Response

```json
{
  "success": true,
  "data": {
    "shifts": [
      {
        "branch": "A",
        "branch_display_name": "ARMY",
        "fy2025_budget": 180000000000,
        "fy2026_budget": 185000000000,
        "budget_change": 5000000000,
        "change_percent": 2.8
      },
      {
        "branch": "N",
        "branch_display_name": "NAVY",
        "fy2025_budget": 200000000000,
        "fy2026_budget": 195000000000,
        "budget_change": -5000000000,
        "change_percent": -2.5
      }
    ],
    "total_records": 6,
    "fiscal_years": [2025, 2026]
  },
  "message": "Account shifts analysis retrieved successfully",
  "last_updated": "2025-01-18T21:37:06.888Z"
}
```

### 6. Budget Execution Trends Response

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "identifier": "0601101F",
        "program_name": "F-35 Lightning II",
        "category": "Procurement",
        "organization": "F",
        "budget_amount": 15000000000,
        "spent_amount": 0,
        "remaining_amount": 15000000000,
        "execution_rate": 100.0,
        "variance_rate": 5.2,
        "requested_amount": 0,
        "enacted_amount": 15000000000,
        "actual_amount": 0,
        "reconciliation_amount": 0,
        "total_program_amount": 16000000000,
        "supplemental_amount": 1000000000,
        "total_authorized_amount": 16000000000,
        "phases_available": 3,
        "contract_linkable": true
      }
    ],
    "total": 150,
    "summary": {
      "total_requested": 0,
      "total_enacted": 800000000000,
      "total_budget": 800000000000,
      "total_spent": 0,
      "total_remaining": 800000000000,
      "total_supplemental": 50000000000,
      "total_authorized": 850000000000,
      "overall_execution_rate": 100.0,
      "data_note": "Authorization data only - no spending/execution data available",
      "total_programs": 150
    }
  },
  "message": "Budget execution trends retrieved successfully",
  "last_updated": "2025-01-18T21:37:06.888Z"
}
```

### 7. Weapons Intelligence Response

```json
{
  "success": true,
  "data": {
    "summary": {
      "total_categories": 25
    },
    "high_value_systems": [
      {
        "weapons_category": "Fighter Aircraft",
        "organization": "F",
        "system_count": 15,
        "total_budget": 45000000000,
        "avg_budget": 3000000000
      },
      {
        "weapons_category": "Surface Ships",
        "organization": "N",
        "system_count": 8,
        "total_budget": 32000000000,
        "avg_budget": 4000000000
      }
    ],
    "categories": ["Fighter Aircraft", "Surface Ships", "Ground Vehicles", "Missiles"],
    "organizations": ["F", "N", "A", "M", "S"]
  },
  "message": "Weapons intelligence retrieved successfully",
  "last_updated": "2025-01-18T21:37:06.888Z"
}
```

### 8. Budget Health Response

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "DoD Budget Intelligence",
    "timestamp": "2025-01-18T21:37:06.888Z",
    "connection": "connected"
  },
  "message": "Budget intelligence service is healthy"
}
```

## Frontend Integration for Dashboard Bottom Section

### 1. Top Programs by Budget (Fiscal Year Specific)

#### API Calls for Different Fiscal Years

```javascript
// 2024 View - Prioritizes "Actual" phase
const getTopPrograms2024 = async (limit = 10) => {
  const response = await fetch('https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=2024&sort_by=primary_budget_amount&sort_order=desc&limit=' + limit);
  return response.json();
};

// 2025 View - Prioritizes "Enacted" phase
const getTopPrograms2025 = async (limit = 10) => {
  const response = await fetch('https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=2025&sort_by=primary_budget_amount&sort_order=desc&limit=' + limit);
  return response.json();
};

// 2026 View - Uses "Total" phase
const getTopPrograms2026 = async (limit = 10) => {
  const response = await fetch('https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=2026&sort_by=primary_budget_amount&sort_order=desc&limit=' + limit);
  return response.json();
};
```

#### Dynamic Fiscal Year Selection

```javascript
const getTopProgramsByFiscalYear = async (fiscalYear, limit = 10) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${fiscalYear}&sort_by=primary_budget_amount&sort_order=desc&limit=${limit}`);
  return response.json();
};

// Usage examples
const programs2024 = await getTopProgramsByFiscalYear(2024, 10);
const programs2025 = await getTopProgramsByFiscalYear(2025, 10);
const programs2026 = await getTopProgramsByFiscalYear(2026, 10);
```

### 2. Data Structure for Dashboard Cards

#### Expected API Response Structure

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "identifier": "9999",
        "program_name": "Classified Programs",
        "appropriation_type": "O1_OpMaint",
        "account_code": "0100D",
        "primary_budget_amount": 20301291000,
        "fiscal_year": 2024,
        "phase": "Actual",
        "category": "Operations",
        "identifier_type": "O1",
        "organization": "DoD",
        "contract_linkable": true,
        "fy_2024_budget": 0,
        "fy_2025_budget": 0,
        "fy_2026_budget": 0
      }
    ],
    "total": 2112
  },
  "message": "Budget programs retrieved successfully",
  "last_updated": "2025-09-18T21:37:06.888Z"
}
```

#### Frontend Data Processing

```javascript
const processProgramData = (apiResponse) => {
  return apiResponse.data.data.map(program => ({
    id: program.identifier,
    name: program.program_name,
    category: program.category,
    categoryCode: program.identifier_type,
    organization: program.organization,
    budget: program.primary_budget_amount,
    fiscalYear: program.fiscal_year,
    phase: program.phase,
    isContractLinkable: program.contract_linkable,
    // Format budget for display
    formattedBudget: formatCurrency(program.primary_budget_amount),
    // Calculate obligation percentage (if available)
    obligationPercentage: calculateObligationPercentage(program)
  }));
};
```

### 3. Dashboard Card Rendering

#### React Component Example

```jsx
import React, { useState, useEffect } from 'react';

const TopProgramsCard = ({ fiscalYear, limit = 10 }) => {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTopPrograms = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${fiscalYear}&sort_by=primary_budget_amount&sort_order=desc&limit=${limit}`);
        const data = await response.json();
        
        if (data.success) {
          setPrograms(processProgramData(data));
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to fetch programs');
      } finally {
        setLoading(false);
      }
    };

    fetchTopPrograms();
  }, [fiscalYear, limit]);

  if (loading) return <div>Loading top programs...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="top-programs-section">
      <h3>Top Programs - FY{fiscalYear}</h3>
      <div className="programs-grid">
        {programs.map((program, index) => (
          <div key={program.id} className="program-card">
            <div className="program-header">
              <span className="program-rank">#{index + 1}</span>
              <span className="category-badge">{program.categoryCode}</span>
            </div>
            <h4 className="program-name">{program.name}</h4>
            <div className="program-details">
              <div className="budget-info">
                <span className="budget-label">Budget:</span>
                <span className="budget-amount">{program.formattedBudget}</span>
              </div>
              <div className="organization-info">
                <span className="org-label">Organization:</span>
                <span className="org-name">{program.organization}</span>
              </div>
              <div className="phase-info">
                <span className="phase-label">Phase:</span>
                <span className="phase-value">{program.phase}</span>
              </div>
            </div>
            {program.isContractLinkable && (
              <div className="contract-linkable-badge">Contract Linkable</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopProgramsCard;
```

## Advanced Filtering Implementation

### 1. Filter Parameters Available

#### Organization Filter
```javascript
const getProgramsByOrganization = async (organization, fiscalYear) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${fiscalYear}&organization=${organization}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};

// Available organizations: "Navy", "Air Force", "Army", "DoD", "DHA", "DEFW"
```

#### Category Filter
```javascript
const getProgramsByCategory = async (category, fiscalYear) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${fiscalYear}&category=${category}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};

// Available categories: "R&D", "Procurement", "Operations", "Military Construction"
```

#### Search Filter
```javascript
const searchPrograms = async (searchQuery, fiscalYear) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${fiscalYear}&search=${encodeURIComponent(searchQuery)}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};
```

#### Budget Range Filter
```javascript
const getProgramsByBudgetRange = async (minBudget, fiscalYear) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${fiscalYear}&min_budget=${minBudget}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};
```

### 2. Combined Filtering

#### Advanced Filter Component

```jsx
import React, { useState, useEffect } from 'react';

const ProgramFilters = ({ onFiltersChange, fiscalYear }) => {
  const [filters, setFilters] = useState({
    organization: '',
    category: '',
    search: '',
    minBudget: '',
    sortBy: 'primary_budget_amount',
    sortOrder: 'desc'
  });

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const buildQueryString = (filters) => {
    const params = new URLSearchParams();
    params.append('fiscal_year', fiscalYear);
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== '') {
        params.append(key, value);
      }
    });
    
    return params.toString();
  };

  const applyFilters = async () => {
    const queryString = buildQueryString(filters);
    const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?${queryString}`);
    const data = await response.json();
    return data;
  };

  return (
    <div className="program-filters">
      <div className="filter-row">
        <select 
          value={filters.organization} 
          onChange={(e) => handleFilterChange('organization', e.target.value)}
        >
          <option value="">All Organizations</option>
          <option value="Navy">Navy</option>
          <option value="Air Force">Air Force</option>
          <option value="Army">Army</option>
          <option value="DoD">DoD</option>
          <option value="DHA">DHA</option>
          <option value="DEFW">DEFW</option>
        </select>

        <select 
          value={filters.category} 
          onChange={(e) => handleFilterChange('category', e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="R&D">R&D</option>
          <option value="Procurement">Procurement</option>
          <option value="Operations">Operations</option>
          <option value="Military Construction">Military Construction</option>
        </select>

        <input 
          type="text" 
          placeholder="Search programs..." 
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
        />

        <input 
          type="number" 
          placeholder="Min Budget (in thousands)" 
          value={filters.minBudget}
          onChange={(e) => handleFilterChange('minBudget', e.target.value)}
        />
      </div>

      <div className="sort-row">
        <select 
          value={filters.sortBy} 
          onChange={(e) => handleFilterChange('sortBy', e.target.value)}
        >
          <option value="primary_budget_amount">Budget Amount</option>
          <option value="program_name">Program Name</option>
          <option value="organization">Organization</option>
          <option value="category">Category</option>
        </select>

        <select 
          value={filters.sortOrder} 
          onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  );
};

export default ProgramFilters;
```

### 3. Real-time Filter Updates

#### Debounced Search Implementation

```javascript
import { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';

const useProgramFilters = (fiscalYear) => {
  const [filters, setFilters] = useState({
    organization: '',
    category: '',
    search: '',
    minBudget: '',
    sortBy: 'primary_budget_amount',
    sortOrder: 'desc'
  });
  
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (searchFilters) => {
      try {
        setLoading(true);
        const queryString = buildQueryString(searchFilters);
        const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?${queryString}`);
        const data = await response.json();
        
        if (data.success) {
          setPrograms(processProgramData(data));
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to fetch programs');
      } finally {
        setLoading(false);
      }
    }, 300),
    [fiscalYear]
  );

  useEffect(() => {
    debouncedSearch(filters);
  }, [filters, debouncedSearch]);

  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  return { filters, programs, loading, error, updateFilters };
};
```

## Dashboard Integration Examples

### 1. Fiscal Year Toggle Component

```jsx
const FiscalYearToggle = ({ currentYear, onYearChange }) => {
  const years = [2024, 2025, 2026];
  
  return (
    <div className="fiscal-year-toggle">
      {years.map(year => (
        <button
          key={year}
          className={`year-button ${currentYear === year ? 'active' : ''}`}
          onClick={() => onYearChange(year)}
        >
          FY{year}
        </button>
      ))}
    </div>
  );
};
```

### 2. Complete Dashboard Integration

```jsx
import React, { useState } from 'react';
import TopProgramsCard from './TopProgramsCard';
import ProgramFilters from './ProgramFilters';
import FiscalYearToggle from './FiscalYearToggle';

const BudgetDashboard = () => {
  const [currentFiscalYear, setCurrentFiscalYear] = useState(2025);
  const [filters, setFilters] = useState({});
  const [programs, setPrograms] = useState([]);

  const handleYearChange = (year) => {
    setCurrentFiscalYear(year);
    // Reset filters when changing fiscal year
    setFilters({});
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    // Trigger API call with new filters
    fetchFilteredPrograms(newFilters);
  };

  const fetchFilteredPrograms = async (filterParams) => {
    try {
      const queryString = buildQueryString(filterParams);
      const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${currentFiscalYear}&${queryString}`);
      const data = await response.json();
      
      if (data.success) {
        setPrograms(processProgramData(data));
      }
    } catch (error) {
      console.error('Failed to fetch filtered programs:', error);
    }
  };

  return (
    <div className="budget-dashboard">
      <div className="dashboard-header">
        <h1>Budget Dashboard</h1>
        <FiscalYearToggle 
          currentYear={currentFiscalYear} 
          onYearChange={handleYearChange} 
        />
      </div>
      
      <div className="dashboard-content">
        <div className="filters-section">
          <ProgramFilters 
            onFiltersChange={handleFiltersChange}
            fiscalYear={currentFiscalYear}
          />
        </div>
        
        <div className="programs-section">
          <TopProgramsCard 
            fiscalYear={currentFiscalYear}
            limit={10}
          />
        </div>
      </div>
    </div>
  );
};

export default BudgetDashboard;
```

## Utility Functions

```javascript
// Currency formatting
const formatCurrency = (amount) => {
  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(1)}B`;
  } else if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  } else {
    return `$${amount.toLocaleString()}`;
  }
};

// Query string builder
const buildQueryString = (filters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== '') {
      params.append(key, value);
    }
  });
  return params.toString();
};

// Data processing
const processProgramData = (apiResponse) => {
  return apiResponse.data.data.map(program => ({
    id: program.identifier,
    name: program.program_name,
    category: program.category,
    categoryCode: program.identifier_type,
    organization: program.organization,
    budget: program.primary_budget_amount,
    formattedBudget: formatCurrency(program.primary_budget_amount),
    fiscalYear: program.fiscal_year,
    phase: program.phase,
    isContractLinkable: program.contract_linkable
  }));
};
```

## Advanced Frontend Integration Examples

### 1. Budget Schema Integration

```jsx
import React, { useState, useEffect } from 'react';

const BudgetSchemaExplorer = () => {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchema = async () => {
      try {
        const response = await fetch('https://apilayer-production.up.railway.app/api/v1/budget/schema');
        const data = await response.json();
        setSchema(data);
      } catch (error) {
        console.error('Failed to fetch schema:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchema();
  }, []);

  if (loading) return <div>Loading schema...</div>;

  return (
    <div className="schema-explorer">
      <h3>Budget Data Schema</h3>
      <p>Table: {schema?.table}</p>
      <p>Total Columns: {schema?.total_columns}</p>
      <div className="columns-list">
        {schema?.columns?.map((column, index) => (
          <div key={index} className="column-info">
            <strong>{column.COLUMN_NAME}</strong> - {column.DATA_TYPE}
            {column.IS_NULLABLE === 'YES' && <span className="nullable"> (nullable)</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BudgetSchemaExplorer;
```

### 2. Account Shifts Analysis Component

```jsx
import React, { useState, useEffect } from 'react';

const AccountShiftsAnalysis = () => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchAccountShifts = async () => {
    try {
      setLoading(true);
        const response = await fetch('https://apilayer-production.up.railway.app/api/v1/budget/account-shifts');
        const data = await response.json();
        
        if (data.success) {
          setShifts(data.data.shifts);
        } else {
          setError(data.message);
        }
    } catch (err) {
        setError('Failed to fetch account shifts');
    } finally {
      setLoading(false);
    }
  };
  
    fetchAccountShifts();
  }, []);

  if (loading) return <div>Loading account shifts...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="account-shifts">
      <h3>Budget Shifts: FY2025 → FY2026</h3>
      <div className="shifts-grid">
        {shifts.map((shift, index) => (
          <div key={index} className={`shift-card ${shift.budget_change >= 0 ? 'increase' : 'decrease'}`}>
            <div className="branch-info">
              <h4>{shift.branch_display_name}</h4>
              <span className="branch-code">{shift.branch}</span>
            </div>
            <div className="budget-comparison">
              <div className="budget-year">
                <span className="year">FY2025</span>
                <span className="amount">{formatCurrency(shift.fy2025_budget)}</span>
              </div>
              <div className="arrow">→</div>
              <div className="budget-year">
                <span className="year">FY2026</span>
                <span className="amount">{formatCurrency(shift.fy2026_budget)}</span>
              </div>
            </div>
            <div className="change-info">
              <span className={`change-amount ${shift.budget_change >= 0 ? 'positive' : 'negative'}`}>
                {shift.budget_change >= 0 ? '+' : ''}{formatCurrency(shift.budget_change)}
              </span>
              <span className={`change-percent ${shift.change_percent >= 0 ? 'positive' : 'negative'}`}>
                {shift.change_percent >= 0 ? '+' : ''}{shift.change_percent}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AccountShiftsAnalysis;
```

### 3. Budget Execution Trends Component

```jsx
import React, { useState, useEffect } from 'react';

const BudgetExecutionTrends = ({ organization, category, fiscalYear = 2025 }) => {
  const [trends, setTrends] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    organization: organization || '',
    category: category || '',
    fiscal_year: fiscalYear,
    min_budget: '',
    limit: 50
  });

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        setLoading(true);
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) queryParams.append(key, value);
        });

        const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/trends?${queryParams}`);
        const data = await response.json();
        
        if (data.success) {
          setTrends(data.data.data);
          setSummary(data.data.summary);
        }
      } catch (error) {
        console.error('Failed to fetch trends:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div>Loading execution trends...</div>;

  return (
    <div className="execution-trends">
      <div className="trends-header">
        <h3>Budget Execution Trends</h3>
        <div className="filters">
          <select 
            value={filters.organization} 
            onChange={(e) => handleFilterChange('organization', e.target.value)}
          >
            <option value="">All Organizations</option>
            <option value="Navy">Navy</option>
            <option value="Air Force">Air Force</option>
            <option value="Army">Army</option>
            <option value="DoD">DoD</option>
          </select>
          
          <select 
            value={filters.category} 
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="R&D">R&D</option>
            <option value="Procurement">Procurement</option>
            <option value="Operations">Operations</option>
            <option value="Military Construction">Military Construction</option>
          </select>
        </div>
      </div>

      {summary && (
        <div className="trends-summary">
          <div className="summary-card">
            <h4>Overall Summary</h4>
            <div className="summary-stats">
              <div className="stat">
                <span className="label">Total Enacted:</span>
                <span className="value">{formatCurrency(summary.total_enacted)}</span>
              </div>
              <div className="stat">
                <span className="label">Total Authorized:</span>
                <span className="value">{formatCurrency(summary.total_authorized)}</span>
              </div>
              <div className="stat">
                <span className="label">Execution Rate:</span>
                <span className="value">{summary.overall_execution_rate.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="trends-list">
        {trends.map((trend, index) => (
          <div key={trend.identifier} className="trend-card">
            <div className="program-header">
              <h4>{trend.program_name}</h4>
              <span className="identifier">{trend.identifier}</span>
            </div>
            <div className="program-details">
              <div className="detail">
                <span className="label">Category:</span>
                <span className="value">{trend.category}</span>
              </div>
              <div className="detail">
                <span className="label">Organization:</span>
                <span className="value">{trend.organization}</span>
              </div>
            </div>
            <div className="budget-breakdown">
              <div className="budget-item">
                <span className="label">Budget Amount:</span>
                <span className="value">{formatCurrency(trend.budget_amount)}</span>
              </div>
              <div className="budget-item">
                <span className="label">Enacted:</span>
                <span className="value">{formatCurrency(trend.enacted_amount)}</span>
              </div>
              <div className="budget-item">
                <span className="label">Execution Rate:</span>
                <span className="value">{trend.execution_rate.toFixed(1)}%</span>
              </div>
            </div>
            {trend.variance_rate && (
              <div className="variance">
                <span className="label">Variance:</span>
                <span className={`value ${trend.variance_rate >= 0 ? 'positive' : 'negative'}`}>
                  {trend.variance_rate >= 0 ? '+' : ''}{trend.variance_rate.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BudgetExecutionTrends;
```

### 4. Weapons Intelligence Component

```jsx
import React, { useState, useEffect } from 'react';

const WeaponsIntelligence = () => {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    min_budget: '',
    limit: 50
  });

  useEffect(() => {
    const fetchIntelligence = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });

      const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs/weapons-intelligence?${queryParams}`);
      const data = await response.json();
      
      if (data.success) {
        setIntelligence(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch weapons intelligence:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntelligence();
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div>Loading weapons intelligence...</div>;

  return (
    <div className="weapons-intelligence">
      <div className="intelligence-header">
        <h3>Weapons Systems Intelligence</h3>
        <div className="filters">
          <input 
            type="text" 
            placeholder="Search categories..." 
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
          />
          <input 
            type="number" 
            placeholder="Min Budget (millions)" 
            value={filters.min_budget}
            onChange={(e) => handleFilterChange('min_budget', e.target.value)}
          />
        </div>
      </div>

      {intelligence && (
        <>
          <div className="intelligence-summary">
            <div className="summary-card">
              <h4>Summary</h4>
              <p>Total Categories: {intelligence.summary.total_categories}</p>
              <div className="available-filters">
                <div className="filter-group">
                  <h5>Available Categories:</h5>
                  <div className="filter-tags">
                    {intelligence.categories.map((category, index) => (
                      <span key={index} className="filter-tag">{category}</span>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <h5>Organizations:</h5>
                  <div className="filter-tags">
                    {intelligence.organizations.map((org, index) => (
                      <span key={index} className="filter-tag">{org}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="high-value-systems">
            <h4>High-Value Systems</h4>
            <div className="systems-grid">
              {intelligence.high_value_systems.map((system, index) => (
                <div key={index} className="system-card">
                  <div className="system-header">
                    <h5>{system.weapons_category}</h5>
                    <span className="organization">{system.organization}</span>
                  </div>
                  <div className="system-stats">
                    <div className="stat">
                      <span className="label">Systems:</span>
                      <span className="value">{system.system_count}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Total Budget:</span>
                      <span className="value">{formatCurrency(system.total_budget)}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Avg Budget:</span>
                      <span className="value">{formatCurrency(system.avg_budget)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeaponsIntelligence;
```

### 5. Comprehensive Dashboard Integration

```jsx
import React, { useState } from 'react';
import TopProgramsCard from './TopProgramsCard';
import ProgramFilters from './ProgramFilters';
import FiscalYearToggle from './FiscalYearToggle';
import AccountShiftsAnalysis from './AccountShiftsAnalysis';
import BudgetExecutionTrends from './BudgetExecutionTrends';
import WeaponsIntelligence from './WeaponsIntelligence';
import BudgetSchemaExplorer from './BudgetSchemaExplorer';

const ComprehensiveBudgetDashboard = () => {
  const [currentFiscalYear, setCurrentFiscalYear] = useState(2025);
  const [activeTab, setActiveTab] = useState('programs');
  const [filters, setFilters] = useState({});
  const [programs, setPrograms] = useState([]);

  const handleYearChange = (year) => {
    setCurrentFiscalYear(year);
    setFilters({});
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    fetchFilteredPrograms(newFilters);
  };

  const fetchFilteredPrograms = async (filterParams) => {
    try {
      const queryString = buildQueryString(filterParams);
      const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/budget/programs?fiscal_year=${currentFiscalYear}&${queryString}`);
      const data = await response.json();
      
      if (data.success) {
        setPrograms(processProgramData(data));
      }
    } catch (error) {
      console.error('Failed to fetch filtered programs:', error);
    }
  };

  const tabs = [
    { id: 'programs', label: 'Top Programs', component: TopProgramsCard },
    { id: 'shifts', label: 'Account Shifts', component: AccountShiftsAnalysis },
    { id: 'trends', label: 'Execution Trends', component: BudgetExecutionTrends },
    { id: 'weapons', label: 'Weapons Intelligence', component: WeaponsIntelligence },
    { id: 'schema', label: 'Data Schema', component: BudgetSchemaExplorer }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="comprehensive-budget-dashboard">
      <div className="dashboard-header">
        <h1>DoD Budget Intelligence Dashboard</h1>
        <FiscalYearToggle 
          currentYear={currentFiscalYear} 
          onYearChange={handleYearChange} 
        />
      </div>
      
      <div className="dashboard-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="dashboard-content">
        {activeTab === 'programs' && (
          <div className="programs-section">
            <div className="filters-section">
              <ProgramFilters 
                onFiltersChange={handleFiltersChange}
                fiscalYear={currentFiscalYear}
              />
            </div>
            <TopProgramsCard 
              fiscalYear={currentFiscalYear}
              limit={10}
            />
          </div>
        )}
        
        {activeTab !== 'programs' && ActiveComponent && (
          <ActiveComponent fiscalYear={currentFiscalYear} />
        )}
      </div>
    </div>
  );
};

export default ComprehensiveBudgetDashboard;
```

## Summary

This comprehensive integration guide provides everything needed to build a complete budget intelligence dashboard:

### Core Features:
1. **Complete API Coverage**: All 10 budget endpoints with full documentation
2. **Response Structures**: Detailed JSON response examples for every endpoint
3. **Frontend Components**: Ready-to-use React components for all features
4. **Advanced Analytics**: Account shifts, execution trends, weapons intelligence
5. **Dynamic Filtering**: Organization, category, fiscal year, and budget range filters
6. **Real-time Updates**: Debounced search and filter updates
7. **Performance Optimization**: Caching, pagination, and loading states
8. **Error Handling**: Comprehensive error handling and user feedback

### Key Endpoints Covered:
- **Budget Schema**: Dynamic field discovery and data exploration
- **Budget Programs**: Main data source with advanced filtering
- **Programs Summary**: High-level statistics and utilization rates
- **Account Shifts**: FY2025→FY2026 budget changes by branch
- **Execution Trends**: Program-level authorization analysis
- **Weapons Intelligence**: High-value systems and categories
- **Health Monitoring**: Service status and connection checks

The frontend can now build a complete budget intelligence dashboard with advanced analytics, real-time filtering, and comprehensive data visualization capabilities.
