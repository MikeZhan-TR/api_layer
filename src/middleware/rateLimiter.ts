import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// Create rate limiter instances
const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '100'), // Number of requests
  duration: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000') / 1000, // Per 15 minutes (in seconds)
});

// Stricter rate limiter for expensive operations
const strictRateLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 900, // Per 15 minutes
});

export async function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const key = req.user?.id || req.ip || 'anonymous';
    
    // Apply rate limiting
    await rateLimiter.consume(key);
    
    // Add rate limit headers
    const resRateLimiter = await rateLimiter.get(key);
    if (resRateLimiter) {
      res.set({
        'X-RateLimit-Limit': process.env.API_RATE_LIMIT_MAX_REQUESTS || '100',
        'X-RateLimit-Remaining': String(resRateLimiter.remainingPoints || 0),
        'X-RateLimit-Reset': String(new Date(Date.now() + resRateLimiter.msBeforeNext)),
      });
    }
    
    next();
  } catch (rateLimiterRes) {
    logger.warn('Rate limit exceeded', {
      key: req.user?.id || req.ip || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });

    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Try again in ${secs} seconds.`,
        timestamp: new Date().toISOString(),
        details: {
          retryAfter: secs,
          limit: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '100'),
          windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000')
        }
      }
    });
  }
}

// Strict rate limiter for expensive operations (bulk exports, complex aggregations)
export async function strictRateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const key = req.user?.id || req.ip || 'anonymous';
    
    // Apply strict rate limiting
    await strictRateLimiter.consume(key);
    
    // Add rate limit headers
    const resRateLimiter = await strictRateLimiter.get(key);
    if (resRateLimiter) {
      res.set({
        'X-RateLimit-Limit-Strict': '10',
        'X-RateLimit-Remaining-Strict': String(resRateLimiter.remainingPoints || 0),
        'X-RateLimit-Reset-Strict': String(new Date(Date.now() + resRateLimiter.msBeforeNext)),
      });
    }
    
    next();
  } catch (rateLimiterRes) {
    logger.warn('Strict rate limit exceeded', {
      key: req.user?.id || req.ip || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });

    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    
    res.status(429).json({
      success: false,
      error: {
        code: 'STRICT_RATE_LIMIT_EXCEEDED',
        message: `Too many expensive requests. Try again in ${secs} seconds.`,
        timestamp: new Date().toISOString(),
        details: {
          retryAfter: secs,
          limit: 10,
          windowMs: 900000,
          type: 'strict'
        }
      }
    });
  }
}

// Apply different rate limits based on subscription tier
export function tieredRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const userTier = req.user?.subscription_tier || 'free';
  
  // Different limits based on subscription tier
  const tierLimits = {
    free: { points: 50, duration: 900 },      // 50 requests per 15 minutes
    pro: { points: 200, duration: 900 },      // 200 requests per 15 minutes  
    enterprise: { points: 1000, duration: 900 } // 1000 requests per 15 minutes
  };
  
  const limit = tierLimits[userTier];
  
  const tieredLimiter = new RateLimiterMemory({
    points: limit.points,
    duration: limit.duration,
  });
  
  tieredLimiter.consume(req.user?.id || req.ip || 'anonymous')
    .then(() => {
      res.set({
        'X-RateLimit-Tier': userTier,
        'X-RateLimit-Tier-Limit': String(limit.points),
      });
      next();
    })
    .catch((rateLimiterRes) => {
      logger.warn(`Tiered rate limit exceeded for ${userTier} user`, {
        userId: req.user?.id,
        tier: userTier,
        ip: req.ip,
        path: req.path
      });

      const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
      res.set('Retry-After', String(secs));
      
      res.status(429).json({
        success: false,
        error: {
          code: 'TIER_RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded for ${userTier} tier. Consider upgrading your subscription.`,
          timestamp: new Date().toISOString(),
          details: {
            retryAfter: secs,
            currentTier: userTier,
            tierLimit: limit.points,
            upgradeUrl: '/upgrade'
          }
        }
      });
    });
}

export { rateLimiterMiddleware as rateLimiter };

