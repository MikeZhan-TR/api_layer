import snowflake from 'snowflake-sdk';
import { databaseConfig, validateDatabaseConfig } from '../config/database';
import { createLogger } from '../utils/logger';
import { QueryOptions, QueryResult } from '../types/usaspending';
import NodeCache from 'node-cache';

const logger = createLogger();

class SnowflakeService {
  private connection: snowflake.Connection | null = null;
  private cache: NodeCache;
  private isConnected = false;

  constructor() {
    // Cache with 5 minute default TTL
    this.cache = new NodeCache({ 
      stdTTL: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
      checkperiod: 60,
      useClones: false 
    });
    
    // Validation will happen when config is accessed
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.connection) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection(databaseConfig.snowflake);
      
      this.connection.connect((err, conn) => {
        if (err) {
          logger.error('Failed to connect to Snowflake:', err);
          reject(new Error(`Snowflake connection failed: ${err.message}`));
          return;
        }
        
        this.isConnected = true;
        logger.info('Successfully connected to Snowflake');
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection && this.isConnected) {
      return new Promise((resolve) => {
        this.connection!.destroy((err) => {
          if (err) {
            logger.error('Error disconnecting from Snowflake:', err);
          } else {
            logger.info('Disconnected from Snowflake');
          }
          this.isConnected = false;
          this.connection = null;
          resolve();
        });
      });
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.executeQuery('SELECT 1 as test');
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Snowflake connection test failed:', error);
      return false;
    }
  }

  async executeQuery<T = any>(
    sqlText: string, 
    binds: any[] = [],
    options: { useCache?: boolean; cacheKey?: string; cacheTTL?: number } = {}
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const cacheKey = options.cacheKey || `query:${Buffer.from(sqlText + JSON.stringify(binds)).toString('base64').slice(0, 50)}`;
    
    // Check cache first
    if (options.useCache !== false) {
      const cached = this.cache.get<QueryResult<T>>(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for query: ${cacheKey}`);
        return cached;
      }
    }

    await this.connect();
    
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        reject(new Error('No Snowflake connection available'));
        return;
      }

      this.connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          const executionTime = Date.now() - startTime;
          
          if (err) {
            logger.error('Snowflake query error:', {
              error: err.message,
              sqlText: sqlText.substring(0, 200),
              executionTime
            });
            reject(new Error(`Query failed: ${err.message}`));
            return;
          }

          const result: QueryResult<T> = {
            rows: rows || [],
            totalCount: rows?.length || 0,
            executionTime
          };

          // Cache successful results
          if (options.useCache !== false && result.rows.length > 0) {
            const ttl = options.cacheTTL || parseInt(process.env.CACHE_TTL_SECONDS || '300');
            this.cache.set(cacheKey, result, ttl);
            logger.debug(`Cached query result: ${cacheKey}`);
          }

          logger.debug(`Query executed successfully`, {
            rowCount: result.totalCount,
            executionTime,
            sqlText: sqlText.substring(0, 100)
          });

          resolve(result);
        }
      });
    });
  }

  async executeCountQuery(sqlText: string, binds: any[] = []): Promise<number> {
    const countQuery = `SELECT COUNT(*) as total FROM (${sqlText})`;
    const result = await this.executeQuery<{ TOTAL: number }>(countQuery, binds);
    return result.rows[0]?.TOTAL || 0;
  }

  buildSelectQuery(
    table: string,
    options: QueryOptions = {}
  ): { sql: string; binds: any[] } {
    const { select = ['*'], where = {}, orderBy, limit, offset } = options;
    
    let sql = `SELECT ${select.join(', ')} FROM ${table}`;
    const binds: any[] = [];
    
    // WHERE clause
    const whereConditions: string[] = [];
    Object.entries(where).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(',');
        whereConditions.push(`${key} IN (${placeholders})`);
        binds.push(...value);
      } else if (value !== null && value !== undefined) {
        whereConditions.push(`${key} = ?`);
        binds.push(value);
      }
    });
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    // ORDER BY
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    
    // LIMIT and OFFSET
    if (limit) {
      sql += ` LIMIT ${limit}`;
      if (offset) {
        sql += ` OFFSET ${offset}`;
      }
    }
    
    return { sql, binds };
  }

  // Specialized query methods for USAspending data
  async getTableRowCount(tableName: string): Promise<number> {
    const result = await this.executeQuery<{ COUNT: number }>(
      `SELECT COUNT(*) as count FROM ${databaseConfig.snowflake.database}.${databaseConfig.snowflake.schema}.${tableName}`,
      [],
      { useCache: true, cacheTTL: 3600 } // Cache for 1 hour
    );
    return result.rows[0]?.COUNT || 0;
  }

  async getTableSchema(tableName: string): Promise<any[]> {
    const result = await this.executeQuery(
      `DESCRIBE TABLE ${databaseConfig.snowflake.database}.${databaseConfig.snowflake.schema}.${tableName}`,
      [],
      { useCache: true, cacheTTL: 3600 }
    );
    return result.rows;
  }

  async getAvailableTables(): Promise<string[]> {
    const result = await this.executeQuery<{ TABLE_NAME: string }>(
      `SHOW TABLES IN SCHEMA ${databaseConfig.snowflake.database}.${databaseConfig.snowflake.schema}`,
      [],
      { useCache: true, cacheTTL: 3600 }
    );
    return result.rows.map(row => row.TABLE_NAME);
  }

  // Cache management
  clearCache(pattern?: string): void {
    if (pattern) {
      const keys = this.cache.keys().filter(key => key.includes(pattern));
      this.cache.del(keys);
      logger.info(`Cleared ${keys.length} cache entries matching pattern: ${pattern}`);
    } else {
      this.cache.flushAll();
      logger.info('Cleared all cache entries');
    }
  }

  getCacheStats(): { keys: number; hits: number; misses: number; ksize: number; vsize: number } {
    return this.cache.getStats();
  }
}

export const snowflakeService = new SnowflakeService();

