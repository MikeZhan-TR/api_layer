/**
 * Advanced Query Builder for dynamic SQL generation with filtering, search, and pagination
 * Extracted and adapted from foundry_api lambda function
 */

export interface FilterOptions {
  operator?: 'AND' | 'OR';
  exact_values?: Record<string, any>;
  dataAvailability?: string[];
  [key: string]: any;
}

export interface QueryBuilderOptions {
  database: string;
  schema: string;
  table: string;
}

export class QueryBuilder {
  private options: QueryBuilderOptions;

  constructor(options: QueryBuilderOptions) {
    this.options = options;
  }

  /**
   * Quote SQL identifiers to handle special characters and reserved words
   */
  quoteIdentifier(identifier: string): string {
    if (identifier.startsWith('"') && identifier.endsWith('"')) {
      return identifier;
    }
    // Escape any existing double quotes in the identifier
    const escaped = identifier.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  /**
   * Get the fully qualified table name
   */
  getFullTableName(): string {
    const { database, schema, table } = this.options;
    return `${database}.${schema}.${table}`;
  }

  /**
   * Determine if a column should be excluded from text search
   */
  private isNonSearchableColumn(colName: string): boolean {
    const colLower = colName.toLowerCase();
    
    // Exclude ID columns
    if (colLower === 'id' || colLower.endsWith('_id') || 
        (colLower.endsWith('id') && colLower.length > 2)) {
      return true;
    }
    
    // Exclude date/time columns
    if (colLower.includes('date') || colLower.includes('time') || 
        colLower.includes('timestamp') || colLower.includes('created') || 
        colLower.includes('updated') || colLower.includes('modified')) {
      return true;
    }
    
    return false;
  }

  /**
   * Build WHERE clause from filters
   */
  buildFilterClause(filters: FilterOptions, columnNames?: string[]): string {
    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) {
      return '';
    }

    const conditions: string[] = [];
    const operator = filters.operator || 'AND';
    const operatorSpaced = ` ${operator} `;

    const columnExists = (colName: string): boolean => {
      return !columnNames || columnNames.includes(colName);
    };

    const q = (col: string): string => this.quoteIdentifier(col);

    // Handle Min/Max range filters
    Object.keys(filters).forEach(key => {
      if (key.endsWith('Min') && columnExists(key.slice(0, -3))) {
        const col = key.slice(0, -3);
        conditions.push(`${q(col)} >= ${filters[key]}`);
      }
      if (key.endsWith('Max') && columnExists(key.slice(0, -3))) {
        const col = key.slice(0, -3);
        conditions.push(`${q(col)} <= ${filters[key]}`);
      }
    });

    // Handle list filters (IN clause)
    Object.keys(filters).forEach(key => {
      if (Array.isArray(filters[key]) && filters[key].length > 0 && columnExists(key)) {
        const valueList = filters[key]
          .map((v: any) => `'${String(v).replace(/'/g, "''")}'`)
          .join(',');
        conditions.push(`${q(key)} IN (${valueList})`);
      }
    });

    // Handle data availability filters (NOT NULL checks)
    if (filters.dataAvailability && Array.isArray(filters.dataAvailability)) {
      const dataAvailConditions: string[] = [];
      filters.dataAvailability.forEach(field => {
        if (columnExists(field)) {
          dataAvailConditions.push(`${q(field)} IS NOT NULL AND ${q(field)} <> ''`);
        }
      });
      if (dataAvailConditions.length > 0) {
        const joiner = ` ${operator} `;
        conditions.push(`(${dataAvailConditions.join(joiner)})`);
      }
    }

    // Handle exact value filters with operators
    if (filters.exact_values && typeof filters.exact_values === 'object') {
      Object.entries(filters.exact_values).forEach(([field, filterObj]) => {
        if (!columnExists(field)) return;

        if (typeof filterObj === 'object' && filterObj !== null && 'operator' in filterObj) {
          const { operator: op, value: val } = filterObj as { operator: string; value: any };
          
          if (['=', '!=', '>', '<', '>=', '<='].includes(op)) {
            if (typeof val === 'number') {
              conditions.push(`${q(field)} ${op} ${val}`);
            } else {
              const valStr = String(val).replace(/'/g, "''");
              conditions.push(`${q(field)} ${op} '${valStr}'`);
            }
          } else if (op === 'CONTAINS') {
            const valStr = String(val).replace(/'/g, "''");
            conditions.push(`${q(field)} ILIKE '%${valStr}%'`);
          } else if (op === 'STARTS_WITH') {
            const valStr = String(val).replace(/'/g, "''");
            conditions.push(`${q(field)} ILIKE '${valStr}%'`);
          } else if (op === 'ENDS_WITH') {
            const valStr = String(val).replace(/'/g, "''");
            conditions.push(`${q(field)} ILIKE '%${valStr}'`);
          } else if (op === 'IS_NULL') {
            conditions.push(`${q(field)} IS NULL`);
          } else if (op === 'IS_NOT_NULL') {
            conditions.push(`${q(field)} IS NOT NULL`);
          }
        } else {
          // Handle simple exact values
          const val = filterObj;
          if (Array.isArray(val) && val.length > 0) {
            const valuesList = val
              .map((v: any) => `'${String(v).replace(/'/g, "''")}'`)
              .join(',');
            conditions.push(`${q(field)} IN (${valuesList})`);
          } else if (typeof val === 'number') {
            conditions.push(`${q(field)} = ${val}`);
          } else if (typeof val === 'boolean') {
            conditions.push(`${q(field)} = ${val}`);
          } else {
            const valStr = String(val).replace(/'/g, "''");
            conditions.push(`${q(field)} = '${valStr}'`);
          }
        }
      });
    }

    return conditions.length > 0 ? operatorSpaced.split(' ').join(conditions.join(operatorSpaced)) : '';
  }

  /**
   * Build search clause for keyword search across text columns
   */
  buildSearchClause(keywords: string, columnNames?: string[]): string {
    if (!keywords || keywords.trim() === '') {
      return '';
    }

    const searchTerms = keywords
      .split(',')
      .map(term => term.trim())
      .filter(term => term.length > 0);

    if (searchTerms.length === 0) {
      return '';
    }

    if (!columnNames) {
      // Fallback to full-text search if no column names provided
      const searchConditions = searchTerms.map(term => {
        const cleanTerm = term.replace(/'/g, "''");
        return `CONTAINS_TEXT('*', '${cleanTerm}')`;
      });
      return searchConditions.join(' OR ');
    }

    // Filter to text-searchable columns only
    const textColumns = columnNames.filter(col => !this.isNonSearchableColumn(col));
    
    if (textColumns.length === 0) {
      console.warn(`No text-searchable columns found among: ${columnNames.join(', ')}`);
      return '';
    }

    const allConditions: string[] = [];
    
    searchTerms.forEach(term => {
      const cleanTerm = term.replace(/'/g, "''");
      const excludeTerm = cleanTerm.startsWith('-');
      
      if (excludeTerm) {
        const termWithoutMinus = cleanTerm.slice(1);
        if (termWithoutMinus.length === 0) return;
        
        const columnConditions = textColumns.map(col => 
          `${this.quoteIdentifier(col)} NOT ILIKE '%${termWithoutMinus}%'`
        );
        allConditions.push(columnConditions.join(' AND '));
      } else {
        const columnConditions = textColumns.map(col => 
          `${this.quoteIdentifier(col)} ILIKE '%${cleanTerm}%'`
        );
        allConditions.push(`(${columnConditions.join(' OR ')})`);
      }
    });

    return allConditions.length > 0 ? allConditions.join(' OR ') : '';
  }

  /**
   * Build complete query with filters, search, and pagination
   */
  buildQuery(options: {
    filters?: FilterOptions;
    searchKeywords?: string;
    page?: number;
    pageSize?: number;
    columnNames?: string[];
    orderBy?: string | undefined;
  }): { dataQuery: string; countQuery: string } {
    const {
      filters = {},
      searchKeywords = '',
      page = 1,
      pageSize = 10,
      columnNames = [],
      orderBy
    } = options;

    const tableName = this.getFullTableName();
    const orderColumn = orderBy || (columnNames.length > 0 ? columnNames[0] : 'ID');

    // Build WHERE clause components
    const filterClause = this.buildFilterClause(filters, columnNames);
    const searchClause = this.buildSearchClause(searchKeywords, columnNames);

    // Combine WHERE clauses
    let whereClause = '';
    if (filterClause && searchClause) {
      whereClause = `WHERE (${filterClause}) AND (${searchClause})`;
    } else if (filterClause) {
      whereClause = `WHERE ${filterClause}`;
    } else if (searchClause) {
      whereClause = `WHERE ${searchClause}`;
    }

    // Build count query
    const countQuery = `SELECT COUNT(*) as total_count FROM ${tableName} ${whereClause}`;

    // Build data query with pagination
    const offset = (page - 1) * pageSize;
    const safeOrderColumn = orderColumn || 'ID';
    const dataQuery = `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${this.quoteIdentifier(safeOrderColumn)} LIMIT ${pageSize} OFFSET ${offset}`;

    return { dataQuery, countQuery };
  }
}
