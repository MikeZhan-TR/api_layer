# Opportunities API Integration Guide

## API Domain

**Base URL**: `https://apilayer-production.up.railway.app`

All API calls should use this domain as the base URL.

## Overview

This document outlines how to interact with the government contract opportunities API routes. The API provides access to government contract opportunities data from FOUNDRY.SAM_CONTRACTS.RAW_CSV with advanced filtering, search, and pagination capabilities.

## Available Endpoints

### 1. Get Opportunities (GET)
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/opportunities`
- **Purpose**: Retrieve government contract opportunities with filtering and search
- **Method**: GET with query parameters

### 2. Advanced Opportunities Search (POST)
- **Endpoint**: `POST https://apilayer-production.up.railway.app/api/v1/opportunities`
- **Purpose**: Advanced search with complex filters in request body
- **Method**: POST with JSON body

### 3. Get Schema Information
- **Endpoint**: `GET https://apilayer-production.up.railway.app/api/v1/opportunities/schema`
- **Purpose**: Get table schema and column information
- **Method**: GET

## API Usage Examples

### 1. Basic GET Request

```javascript
// Simple request to get first 10 opportunities
const getOpportunities = async () => {
  const response = await fetch('https://apilayer-production.up.railway.app/api/v1/opportunities');
  const data = await response.json();
  return data;
};

// Usage
const opportunities = await getOpportunities();
console.log(opportunities);
```

**Expected Response:**
```json
{
  "data": [
    {
      "NOTICE_ID": "123456789",
      "TITLE": "Software Development Services",
      "AGENCY": "Department of Defense",
      "NOTICE_TYPE": "Presolicitation",
      "DATE_POSTED": "2024-01-15",
      "RESPONSE_DEADLINE": "2024-02-15",
      "SET_ASIDE": "Small Business Set-Aside",
      "NAICS_CODE": "541511",
      "CONTRACT_VALUE": 500000
    }
  ],
  "total_count": 1500,
  "page": 1,
  "page_size": 10,
  "total_pages": 150,
  "has_next": true,
  "has_previous": false
}
```

### 2. GET Request with Pagination

```javascript
// Get specific page with custom page size
const getOpportunitiesPage = async (page = 1, pageSize = 20) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/opportunities?page=${page}&page_size=${pageSize}`);
  const data = await response.json();
  return data;
};

// Usage
const page2 = await getOpportunitiesPage(2, 25);
console.log(`Page 2 with 25 items:`, page2);
```

**Expected Response:**
```json
{
  "data": [...],
  "total_count": 1500,
  "page": 2,
  "page_size": 25,
  "total_pages": 60,
  "has_next": true,
  "has_previous": true
}
```

### 3. GET Request with Search Keywords

```javascript
// Search for opportunities with keywords
const searchOpportunities = async (keywords) => {
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/opportunities?search_keywords=${encodeURIComponent(keywords)}`);
  const data = await response.json();
  return data;
};

// Usage
const softwareOpportunities = await searchOpportunities("software development");
console.log('Software opportunities:', softwareOpportunities);
```

**Expected Response:**
```json
{
  "data": [
    {
      "NOTICE_ID": "123456789",
      "TITLE": "Software Development Services for Defense Systems",
      "AGENCY": "Department of Defense",
      "NOTICE_TYPE": "Solicitation",
      "DATE_POSTED": "2024-01-15",
      "RESPONSE_DEADLINE": "2024-02-15",
      "SET_ASIDE": "Small Business Set-Aside",
      "NAICS_CODE": "541511",
      "CONTRACT_VALUE": 500000
    }
  ],
  "total_count": 45,
  "page": 1,
  "page_size": 10,
  "total_pages": 5,
  "has_next": true,
  "has_previous": false
}
```

### 4. GET Request with Filters

```javascript
// Filter by agency and notice type
const getFilteredOpportunities = async () => {
  const params = new URLSearchParams({
    agency: 'Department of Defense',
    notice_type: 'Solicitation',
    set_aside: 'Small Business Set-Aside',
    page: '1',
    page_size: '20'
  });
  
  const response = await fetch(`https://apilayer-production.up.railway.app/api/v1/opportunities?${params}`);
  const data = await response.json();
  return data;
};

// Usage
const dodOpportunities = await getFilteredOpportunities();
console.log('DoD Small Business opportunities:', dodOpportunities);
```

**Expected Response:**
```json
{
  "data": [
    {
      "NOTICE_ID": "123456789",
      "TITLE": "IT Support Services",
      "AGENCY": "Department of Defense",
      "NOTICE_TYPE": "Solicitation",
      "DATE_POSTED": "2024-01-15",
      "RESPONSE_DEADLINE": "2024-02-15",
      "SET_ASIDE": "Small Business Set-Aside",
      "NAICS_CODE": "541511",
      "CONTRACT_VALUE": 250000
    }
  ],
  "total_count": 120,
  "page": 1,
  "page_size": 20,
  "total_pages": 6,
  "has_next": true,
  "has_previous": false
}
```

### 5. Advanced POST Request with Complex Filters

```javascript
// Advanced search with complex filters
const advancedSearch = async () => {
  const requestBody = {
    page: 1,
    page_size: 50,
    search_keywords: "cybersecurity",
    filters: {
      agency: ["Department of Defense", "Department of Homeland Security"],
      notice_type: "Solicitation",
      set_aside: "Small Business Set-Aside",
      contract_value_min: 100000,
      contract_value_max: 5000000,
      date_posted_start: "2024-01-01",
      date_posted_end: "2024-12-31"
    }
  };

  const response = await fetch('https://apilayer-production.up.railway.app/api/v1/opportunities', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  const data = await response.json();
  return data;
};

// Usage
const cybersecurityOpportunities = await advancedSearch();
console.log('Cybersecurity opportunities:', cybersecurityOpportunities);
```

**Expected Response:**
```json
{
  "data": [
    {
      "NOTICE_ID": "987654321",
      "TITLE": "Cybersecurity Assessment Services",
      "AGENCY": "Department of Defense",
      "NOTICE_TYPE": "Solicitation",
      "DATE_POSTED": "2024-02-01",
      "RESPONSE_DEADLINE": "2024-03-01",
      "SET_ASIDE": "Small Business Set-Aside",
      "NAICS_CODE": "541690",
      "CONTRACT_VALUE": 750000
    }
  ],
  "total_count": 25,
  "page": 1,
  "page_size": 50
}
```

### 6. Get Schema Information

```javascript
// Get table schema and column information
const getSchema = async () => {
  const response = await fetch('https://apilayer-production.up.railway.app/api/v1/opportunities/schema');
  const data = await response.json();
  return data;
};

// Usage
const schema = await getSchema();
console.log('Schema information:', schema);
```

**Expected Response:**
```json
{
  "table": "FOUNDRY.SAM_CONTRACTS.RAW_CSV",
  "columns": [
    {
      "COLUMN_NAME": "NOTICE_ID",
      "DATA_TYPE": "VARCHAR",
      "IS_NULLABLE": "YES",
      "COLUMN_DEFAULT": null,
      "ORDINAL_POSITION": 1
    },
    {
      "COLUMN_NAME": "TITLE",
      "DATA_TYPE": "VARCHAR",
      "IS_NULLABLE": "YES",
      "COLUMN_DEFAULT": null,
      "ORDINAL_POSITION": 2
    },
    {
      "COLUMN_NAME": "AGENCY",
      "DATA_TYPE": "VARCHAR",
      "IS_NULLABLE": "YES",
      "COLUMN_DEFAULT": null,
      "ORDINAL_POSITION": 3
    }
  ],
  "total_columns": 15
}
```

## Available Filter Parameters

### Common Filters
- `agency` - Filter by government agency
- `notice_type` - Filter by notice type (Presolicitation, Solicitation, etc.)
- `set_aside` - Filter by set-aside type
- `naics_code` - Filter by NAICS code
- `contract_value_min` - Minimum contract value
- `contract_value_max` - Maximum contract value
- `date_posted_start` - Start date for posting date range
- `date_posted_end` - End date for posting date range
- `response_deadline_start` - Start date for response deadline range
- `response_deadline_end` - End date for response deadline range

### Pagination Parameters
- `page` - Page number (default: 1)
- `page_size` - Number of items per page (default: 10, max: 50000)

### Search Parameters
- `search_keywords` - Keywords to search across multiple fields

## React Component Examples

### 1. Basic Opportunities List Component

```jsx
import React, { useState, useEffect } from 'react';

const OpportunitiesList = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0
  });

  useEffect(() => {
    fetchOpportunities();
  }, [pagination.page, pagination.pageSize]);

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://apilayer-production.up.railway.app/api/v1/opportunities?page=${pagination.page}&page_size=${pagination.pageSize}`
      );
      const data = await response.json();
      
      setOpportunities(data.data);
      setPagination(prev => ({
        ...prev,
        totalCount: data.total_count,
        totalPages: data.total_pages
      }));
    } catch (err) {
      setError('Failed to fetch opportunities');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading opportunities...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="opportunities-list">
      <h2>Government Contract Opportunities</h2>
      <div className="pagination-info">
        Showing {opportunities.length} of {pagination.totalCount} opportunities
      </div>
      
      {opportunities.map((opportunity, index) => (
        <div key={opportunity.NOTICE_ID || index} className="opportunity-card">
          <h3>{opportunity.TITLE}</h3>
          <div className="opportunity-details">
            <p><strong>Agency:</strong> {opportunity.AGENCY}</p>
            <p><strong>Type:</strong> {opportunity.NOTICE_TYPE}</p>
            <p><strong>Posted:</strong> {opportunity.DATE_POSTED}</p>
            <p><strong>Deadline:</strong> {opportunity.RESPONSE_DEADLINE}</p>
            <p><strong>Set-Aside:</strong> {opportunity.SET_ASIDE}</p>
            {opportunity.CONTRACT_VALUE && (
              <p><strong>Value:</strong> ${opportunity.CONTRACT_VALUE.toLocaleString()}</p>
            )}
          </div>
        </div>
      ))}
      
      <div className="pagination-controls">
        <button 
          disabled={pagination.page === 1}
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
        >
          Previous
        </button>
        <span>Page {pagination.page} of {pagination.totalPages}</span>
        <button 
          disabled={pagination.page === pagination.totalPages}
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default OpportunitiesList;
```

### 2. Advanced Search Component

```jsx
import React, { useState, useEffect } from 'react';

const AdvancedOpportunitiesSearch = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search_keywords: '',
    agency: '',
    notice_type: '',
    set_aside: '',
    contract_value_min: '',
    contract_value_max: '',
    date_posted_start: '',
    date_posted_end: ''
  });

  const handleSearch = async () => {
    try {
      setLoading(true);
      
      const requestBody = {
        page: 1,
        page_size: 50,
        search_keywords: filters.search_keywords,
        filters: Object.fromEntries(
          Object.entries(filters).filter(([key, value]) => 
            key !== 'search_keywords' && value !== ''
          )
        )
      };

      const response = await fetch('https://apilayer-production.up.railway.app/api/v1/opportunities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      setOpportunities(data.data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="advanced-search">
      <h2>Advanced Opportunities Search</h2>
      
      <div className="search-form">
        <div className="form-group">
          <label>Search Keywords:</label>
          <input
            type="text"
            value={filters.search_keywords}
            onChange={(e) => handleFilterChange('search_keywords', e.target.value)}
            placeholder="Enter keywords to search..."
          />
        </div>
        
        <div className="form-group">
          <label>Agency:</label>
          <input
            type="text"
            value={filters.agency}
            onChange={(e) => handleFilterChange('agency', e.target.value)}
            placeholder="e.g., Department of Defense"
          />
        </div>
        
        <div className="form-group">
          <label>Notice Type:</label>
          <select
            value={filters.notice_type}
            onChange={(e) => handleFilterChange('notice_type', e.target.value)}
          >
            <option value="">All Types</option>
            <option value="Presolicitation">Presolicitation</option>
            <option value="Solicitation">Solicitation</option>
            <option value="Award">Award</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Set-Aside:</label>
          <select
            value={filters.set_aside}
            onChange={(e) => handleFilterChange('set_aside', e.target.value)}
          >
            <option value="">All Set-Asides</option>
            <option value="Small Business Set-Aside">Small Business Set-Aside</option>
            <option value="8(a)">8(a)</option>
            <option value="HUBZone">HUBZone</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Contract Value Range:</label>
          <input
            type="number"
            value={filters.contract_value_min}
            onChange={(e) => handleFilterChange('contract_value_min', e.target.value)}
            placeholder="Min value"
          />
          <input
            type="number"
            value={filters.contract_value_max}
            onChange={(e) => handleFilterChange('contract_value_max', e.target.value)}
            placeholder="Max value"
          />
        </div>
        
        <button onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      
      <div className="search-results">
        {opportunities.length > 0 ? (
          opportunities.map((opportunity, index) => (
            <div key={opportunity.NOTICE_ID || index} className="opportunity-card">
              <h3>{opportunity.TITLE}</h3>
              <div className="opportunity-details">
                <p><strong>Agency:</strong> {opportunity.AGENCY}</p>
                <p><strong>Type:</strong> {opportunity.NOTICE_TYPE}</p>
                <p><strong>Posted:</strong> {opportunity.DATE_POSTED}</p>
                <p><strong>Deadline:</strong> {opportunity.RESPONSE_DEADLINE}</p>
                <p><strong>Set-Aside:</strong> {opportunity.SET_ASIDE}</p>
                {opportunity.CONTRACT_VALUE && (
                  <p><strong>Value:</strong> ${opportunity.CONTRACT_VALUE.toLocaleString()}</p>
                )}
              </div>
            </div>
          ))
        ) : (
          !loading && <p>No opportunities found. Try adjusting your search criteria.</p>
        )}
      </div>
    </div>
  );
};

export default AdvancedOpportunitiesSearch;
```

## Error Handling

### Common Error Responses

```json
{
  "error": "Internal server error",
  "message": "Unable to retrieve table schema information"
}
```

```json
{
  "error": "Internal server error", 
  "message": "The opportunities table schema could not be accessed"
}
```

### JavaScript Error Handling Example

```javascript
const fetchOpportunitiesWithErrorHandling = async () => {
  try {
    const response = await fetch('https://apilayer-production.up.railway.app/api/v1/opportunities');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch opportunities:', error);
    throw error;
  }
};
```

## Summary

The Opportunities API provides comprehensive access to government contract opportunities data with:

- **Flexible Filtering**: Filter by agency, notice type, set-aside, contract value, dates, and more
- **Advanced Search**: Full-text search across multiple fields
- **Pagination**: Efficient handling of large datasets
- **Schema Discovery**: Dynamic field information for building flexible interfaces
- **Multiple Request Methods**: Both GET and POST for different use cases

All endpoints use the base URL `https://apilayer-production.up.railway.app` and return structured JSON responses with comprehensive metadata for building robust frontend applications.
