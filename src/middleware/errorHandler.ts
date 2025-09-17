import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { ApiError } from '../types/usaspending';

const logger = createLogger();

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logger.error('API Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let statusCode = 500;
  let errorResponse: ApiError = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorResponse = {
      code: 'VALIDATION_ERROR',
      message: err.message,
      timestamp: new Date().toISOString()
    };
  } else if (err.message.includes('Query failed')) {
    statusCode = 500;
    errorResponse = {
      code: 'DATABASE_ERROR',
      message: 'Database query failed',
      timestamp: new Date().toISOString()
    };
  } else if (err.message.includes('connection')) {
    statusCode = 503;
    errorResponse = {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service temporarily unavailable',
      timestamp: new Date().toISOString()
    };
  } else if (err.message.includes('timeout')) {
    statusCode = 408;
    errorResponse = {
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out',
      timestamp: new Date().toISOString()
    };
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    delete errorResponse.details;
  } else {
    errorResponse.details = {
      stack: err.stack,
      originalMessage: err.message
    };
  }

  res.status(statusCode).json({
    success: false,
    error: errorResponse
  });
}

// Async error wrapper utility
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

