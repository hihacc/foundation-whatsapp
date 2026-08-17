import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from './auth.js';
import { logger } from '../lib/logger.js';

export function requestLogger(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || `req_${crypto.randomUUID().slice(0, 8)}`;
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      client: req.clientName || 'anonymous',
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    }, 'HTTP Request Completed');
  });

  next();
}
