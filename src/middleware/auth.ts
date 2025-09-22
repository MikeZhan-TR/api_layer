import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { createLogger } from '../utils/logger';
import { UserContext } from '../types/usaspending';

const logger = createLogger();

// Extend Express Request to include user context
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_AUTH_TOKEN',
          message: 'Authorization header with Bearer token is required',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid authentication token', {
        error: error?.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_AUTH_TOKEN',
          message: 'Invalid or expired authentication token',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    // Get user profile and subscription info (commented out for now)
    // const { data: profile } = await supabase
    //   .from('user_profiles')
    //   .select('role, subscription_tier, permissions')
    //   .eq('user_id', user.id)
    //   .single();

    // Get rate limit info (commented out for now)
    // const { data: rateLimitData } = await supabase
    //   .from('user_rate_limits')
    //   .select('requests_per_hour, requests_used')
    //   .eq('user_id', user.id)
    //   .single();

    // Build user context
    const userContext: UserContext = {
      id: user.id,
      email: user.email || undefined,
      role: 'user',
      permissions: [],
      subscription_tier: 'free',
      rate_limit: undefined
    };

    // Check rate limits
    if (userContext.rate_limit && userContext.rate_limit.requests_remaining <= 0) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'API rate limit exceeded. Please upgrade your subscription or try again later.',
          timestamp: new Date().toISOString(),
          details: {
            requests_per_hour: userContext.rate_limit.requests_per_hour,
            requests_remaining: 0
          }
        }
      });
      return;
    }

    // Attach user context to request
    req.user = userContext;

    // Log successful authentication
    logger.debug('User authenticated successfully', {
      userId: user.id,
      email: user.email,
      role: userContext.role,
      ip: req.ip
    });

    // Update request count (fire and forget) - commented out for now
    // supabase
    //   .from('user_rate_limits')
    //   .upsert({
    //     user_id: user.id,
    //     requests_used: (rateLimitData?.requests_used || 0) + 1,
    //     last_request: new Date().toISOString()
    //   })
    //   .then(({ error }) => {
    //     if (error) {
    //       logger.warn('Failed to update rate limit counter', { error: error.message });
    //     }
    //   });

    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_SERVICE_ERROR',
        message: 'Authentication service temporarily unavailable',
        timestamp: new Date().toISOString()
      }
    });
  }
}

// Optional authentication middleware (for public endpoints with optional user context)
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No auth provided, continue without user context
    next();
    return;
  }

  try {
    // Use the main auth middleware logic but don't fail if auth is invalid
    await authMiddleware(req, res, next);
  } catch (error) {
    // Log the error but continue without user context
    logger.warn('Optional authentication failed, continuing without user context', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });
    next();
  }
}

// Role-based access control middleware
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for this endpoint',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role || '')) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  };
}

// Permission-based access control middleware
export function requirePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for this endpoint',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    if (!req.user.permissions?.includes(requiredPermission)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Access denied. Required permission: ${requiredPermission}`,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  };
}

// Subscription tier middleware
export function requireSubscriptionTier(minimumTier: 'free' | 'pro' | 'enterprise') {
  const tierLevels = { free: 0, pro: 1, enterprise: 2 };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for this endpoint',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    const userTierLevel = tierLevels[req.user.subscription_tier || 'free'];
    const requiredTierLevel = tierLevels[minimumTier];

    if (userTierLevel < requiredTierLevel) {
      res.status(402).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
          message: `This feature requires a ${minimumTier} subscription or higher`,
          timestamp: new Date().toISOString(),
          details: {
            current_tier: req.user.subscription_tier,
            required_tier: minimumTier
          }
        }
      });
      return;
    }

    next();
  };
}

