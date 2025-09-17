import { Router, Request, Response } from 'express';
import { snowflakeService } from '../services/snowflakeService';
import { createLogger } from '../utils/logger';

const router = Router();
const logger = createLogger();

// Health check endpoint
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Test Snowflake connection
    const snowflakeHealthy = await snowflakeService.testConnection();
    
    // Get cache stats
    const cacheStats = snowflakeService.getCacheStats();
    
    const responseTime = Date.now() - startTime;
    
    const healthStatus = {
      status: snowflakeHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        snowflake: {
          status: snowflakeHealthy ? 'up' : 'down',
          database: process.env.SNOWFLAKE_DATABASE,
          schema: process.env.SNOWFLAKE_SCHEMA
        },
        cache: {
          status: 'up',
          keys: cacheStats.keys,
          hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
        }
      },
      performance: {
        responseTime: `${responseTime}ms`,
        uptime: `${Math.floor(process.uptime())}s`
      }
    };
    
    const statusCode = snowflakeHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      responseTime: `${Date.now() - startTime}ms`
    });
  }
});

// Detailed health check with database statistics
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Test connection and get basic stats
    const snowflakeHealthy = await snowflakeService.testConnection();
    const cacheStats = snowflakeService.getCacheStats();
    
    let tableCount = 0;
    let sampleTableRowCount = 0;
    
    if (snowflakeHealthy) {
      try {
        // Get available tables
        const tables = await snowflakeService.getAvailableTables();
        tableCount = tables.length;
        
        // Get row count from a sample table (agencies is small)
        if (tables.includes('AGENCIES')) {
          sampleTableRowCount = await snowflakeService.getTableRowCount('AGENCIES');
        }
      } catch (dbError) {
        logger.warn('Could not fetch database statistics:', dbError);
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: snowflakeHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        snowflake: {
          status: snowflakeHealthy ? 'up' : 'down',
          database: process.env.SNOWFLAKE_DATABASE,
          schema: process.env.SNOWFLAKE_SCHEMA,
          tableCount: tableCount || 0,
          sampleRowCount: sampleTableRowCount || 0
        },
        cache: {
          status: 'up',
          stats: cacheStats
        }
      },
      performance: {
        responseTime: `${responseTime}ms`,
        uptime: `${Math.floor(process.uptime())}s`,
        memoryUsage: process.memoryUsage()
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });
    
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed'
    });
  }
});

export default router;

