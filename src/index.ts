import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createLogger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';
import { snowflakeService } from './services/snowflakeService';

// Routes
import awardsRouter from './routes/awards';
import transactionsRouter from './routes/transactions';
import recipientsRouter from './routes/recipients';
import agenciesRouter from './routes/agencies';
import spendingRouter from './routes/spending';
import referenceRouter from './routes/reference';
import searchRouter from './routes/search';
import healthRouter from './routes/health';
import opportunitiesRouter from './routes/opportunities';
import budgetRouter from './routes/budget';
import dashboardRouter from './routes/dashboard';

const app = express();
const logger = createLogger();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
// CORS configuration - allow all origins for now (will configure later)
app.use(cors({
  origin: true, // Allow all origins for testing
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Performance middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimiter);

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check (no auth required)
app.use('/health', healthRouter);

// All API endpoints (no auth required - public access)
app.use('/api/v1/opportunities', opportunitiesRouter);
app.use('/api/v1/budget', budgetRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/awards', awardsRouter);
app.use('/api/v1/transactions', transactionsRouter);
app.use('/api/v1/recipients', recipientsRouter);
app.use('/api/v1/agencies', agenciesRouter);
app.use('/api/v1/spending', spendingRouter);
app.use('/api/v1/reference', referenceRouter);
app.use('/api/v1/search', searchRouter);

// Authentication middleware (currently disabled - all endpoints are public)
// app.use('/api', authMiddleware);

// Error handling
app.use(errorHandler);

// Initialize services and start server
async function startServer() {
  try {
    // Test Snowflake connection
    await snowflakeService.testConnection();
    logger.info('Snowflake connection established successfully');

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`API Layer server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Public URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'http://localhost:' + PORT}`);
      logger.info('Available public endpoints (no authentication required):');
      logger.info('  - GET  /health');
      logger.info('  - GET/POST /api/v1/opportunities');
      logger.info('  - GET/POST /api/v1/budget');
      logger.info('  - GET  /api/v1/dashboard');
      logger.info('  - GET  /api/v1/awards');
      logger.info('  - GET  /api/v1/transactions');
      logger.info('  - GET  /api/v1/recipients');
      logger.info('  - GET  /api/v1/agencies');
      logger.info('  - GET  /api/v1/spending');
      logger.info('  - GET  /api/v1/reference');
      logger.info('  - GET  /api/v1/search');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await snowflakeService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await snowflakeService.disconnect();
  process.exit(0);
});

startServer();

export default app;