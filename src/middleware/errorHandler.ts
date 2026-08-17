import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { AuthenticatedRequest } from './auth.js';

export type ErrorCode = 
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'ACCOUNT_NOT_FOUND'
  | 'WHATSAPP_NOT_CONNECTED'
  | 'MESSAGE_FAILED'
  | 'QUEUE_ERROR'
  | 'DATABASE_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'req_unknown';

  // 1. Zod Validation Error Handling
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      },
      requestId
    });
    return;
  }

  // 2. Custom Application Error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      data: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      },
      requestId
    });
    return;
  }

  // 3. Fallback Internal Server Error
  logger.error({ err, requestId }, 'Unhandled Server Error');

  res.status(500).json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred. Please try again later.'
    },
    requestId
  });
}
