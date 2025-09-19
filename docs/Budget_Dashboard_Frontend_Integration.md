# Budget Dashboard Frontend Integration Guide

## Overview

This document outlines how the frontend can interact with the new budget API routes to populate the bottom section of the budget dashboard with top programs by budget, including fiscal year filtering and advanced filtering capabilities.

## API Endpoints Available

### 1. Budget Programs Summary
- **Endpoint**: `GET /api/v1/budget/programs/summary`
- **Purpose**: Get high-level budget statistics and totals
- **Returns**: Total budget, program counts, fiscal breakdown, utilization rates

### 2. Budget Programs (Main Data Source)
- **Endpoint**: `GET /api/v1/budget/programs`
- **Purpose**: Get detailed program data with filtering, sorting, and pagination
- **Returns**: Array of budget programs with detailed information

### 3. Budget Programs by Category
- **Endpoint**: `GET /api/v1/budget/programs/by-category`
- **Purpose**: Get programs grouped by budget category
- **Returns**: Programs organized by R&D, Procurement, Operations, Military Construction

## Frontend Integration for Dashboard Bottom Section

### 1. Top Programs by Budget (Fiscal Year Specific)

#### API Calls for Different Fiscal Years

```javascript
// 2024 View - Prioritizes "Actual" phase
const getTopPrograms2024 = async (limit = 10) => {
  const response = await fetch('/api/v1/budget/programs?fiscal_year=2024&sort_by=primary_budget_amount&sort_order=desc&limit=' + limit);
  return response.json();
};

// 2025 View - Prioritizes "Enacted" phase
const getTopPrograms2025 = async (limit = 10) => {
  const response = await fetch('/api/v1/budget/programs?fiscal_year=2025&sort_by=primary_budget_amount&sort_order=desc&limit=' + limit);
  return response.json();
};

// 2026 View - Uses "Total" phase
const getTopPrograms2026 = async (limit = 10) => {
  const response = await fetch('/api/v1/budget/programs?fiscal_year=2026&sort_by=primary_budget_amount&sort_order=desc&limit=' + limit);
  return response.json();
};
```

#### Dynamic Fiscal Year Selection

```javascript
const getTopProgramsByFiscalYear = async (fiscalYear, limit = 10) => {
  const response = await fetch(`/api/v1/budget/programs?fiscal_year=${fiscalYear}&sort_by=primary_budget_amount&sort_order=desc&limit=${limit}`);
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
        const response = await fetch(`/api/v1/budget/programs?fiscal_year=${fiscalYear}&sort_by=primary_budget_amount&sort_order=desc&limit=${limit}`);
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
  const response = await fetch(`/api/v1/budget/programs?fiscal_year=${fiscalYear}&organization=${organization}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};

// Available organizations: "Navy", "Air Force", "Army", "DoD", "DHA", "DEFW"
```

#### Category Filter
```javascript
const getProgramsByCategory = async (category, fiscalYear) => {
  const response = await fetch(`/api/v1/budget/programs?fiscal_year=${fiscalYear}&category=${category}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};

// Available categories: "R&D", "Procurement", "Operations", "Military Construction"
```

#### Search Filter
```javascript
const searchPrograms = async (searchQuery, fiscalYear) => {
  const response = await fetch(`/api/v1/budget/programs?fiscal_year=${fiscalYear}&search=${encodeURIComponent(searchQuery)}&sort_by=primary_budget_amount&sort_order=desc`);
  return response.json();
};
```

#### Budget Range Filter
```javascript
const getProgramsByBudgetRange = async (minBudget, fiscalYear) => {
  const response = await fetch(`/api/v1/budget/programs?fiscal_year=${fiscalYear}&min_budget=${minBudget}&sort_by=primary_budget_amount&sort_order=desc`);
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
    const response = await fetch(`/api/v1/budget/programs?${queryString}`);
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
        const response = await fetch(`/api/v1/budget/programs?${queryString}`);
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
      const response = await fetch(`/api/v1/budget/programs?fiscal_year=${currentFiscalYear}&${queryString}`);
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

### 1. Currency Formatting

```javascript
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
```

### 2. Query String Builder

```javascript
const buildQueryString = (filters) => {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== '') {
      params.append(key, value);
    }
  });
  
  return params.toString();
};
```

### 3. Data Processing

```javascript
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
    isContractLinkable: program.contract_linkable,
    // Add any additional processing needed
  }));
};
```

## Error Handling

### 1. API Error Handling

```javascript
const handleApiError = (error, response) => {
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  if (error) {
    throw new Error(`Network Error: ${error.message}`);
  }
};
```

### 2. Loading States

```javascript
const useLoadingState = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const executeWithLoading = async (asyncFunction) => {
    try {
      setLoading(true);
      setError(null);
      const result = await asyncFunction();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  return { loading, error, executeWithLoading };
};
```

## Performance Optimization

### 1. Caching Strategy

```javascript
const useProgramCache = () => {
  const [cache, setCache] = useState(new Map());
  
  const getCachedData = (key) => {
    return cache.get(key);
  };
  
  const setCachedData = (key, data) => {
    setCache(prev => new Map(prev).set(key, data));
  };
  
  const generateCacheKey = (fiscalYear, filters) => {
    return `${fiscalYear}-${JSON.stringify(filters)}`;
  };
  
  return { getCachedData, setCachedData, generateCacheKey };
};
```

### 2. Pagination Implementation

```javascript
const usePagination = (initialLimit = 10) => {
  const [limit, setLimit] = useState(initialLimit);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  
  const nextPage = () => {
    setOffset(prev => prev + limit);
  };
  
  const prevPage = () => {
    setOffset(prev => Math.max(0, prev - limit));
  };
  
  const resetPagination = () => {
    setOffset(0);
  };
  
  return { limit, offset, total, nextPage, prevPage, resetPagination, setLimit, setTotal };
};
```

## Summary

This integration guide provides a comprehensive approach to:

1. **Fiscal Year Specific Views**: Different API calls for 2024, 2025, and 2026 with appropriate phase prioritization
2. **Top Programs Display**: Card-based layout showing program details, budgets, and metadata
3. **Advanced Filtering**: Organization, category, search, and budget range filters
4. **Real-time Updates**: Debounced search and filter updates
5. **Performance Optimization**: Caching, pagination, and loading states
6. **Error Handling**: Comprehensive error handling and user feedback

The frontend can now effectively populate the dashboard's bottom section with top programs by budget, filtered by fiscal year, and provide advanced filtering capabilities for a rich user experience.
