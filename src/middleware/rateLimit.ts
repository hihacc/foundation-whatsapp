import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

interface ClientWindow {
  count: number;
  resetAt: number;
}

const rateLimitCache = new Map<string, ClientWindow>();

// Clean up stale rate-limit cache entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitCache.entries()) {
      if (now > val.resetAt) rateLimitCache.delete(key);
    }
  }, 300000);
}

export function apiRateLimiter(limit: number = 120, windowMs: number = 60000) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const key = req.clientName || (req.headers['x-forwarded-for'] as string) || req.ip || 'global';
    const now = Date.now();

    const record = rateLimitCache.get(key);

    if (!record || now > record.resetAt) {
      rateLimitCache.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= limit) {
      res.status(429).json({
        success: false,
        data: null,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Rate limit is ${limit} requests per minute.`
        },
        requestId: req.requestId || 'req_unknown'
      });
      return;
    }

    record.count += 1;
    next();
  };
}
