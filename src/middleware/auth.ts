import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { hashApiKey } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';

export interface AuthenticatedRequest extends Request {
  clientName?: string;
  clientId?: string;
  requestId?: string;
}

export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];

  if (!authHeader) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: 'AUTH_ERROR',
        message: 'Missing x-api-key authentication header'
      },
      requestId: req.requestId || 'req_unknown'
    });
    return;
  }

  const rawKey = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : String(authHeader).trim();

  // 1. Direct match with master TFC_SERVICE_API_KEY
  if (rawKey === env.TFC_SERVICE_API_KEY) {
    req.clientName = 'TFC_MASTER_PORTAL';
    return next();
  }

  // 2. Database ApiClient Lookup with SHA-256 hash
  try {
    const hashed = hashApiKey(rawKey);
    const client = await prisma.apiClient.findUnique({
      where: { apiKeyHash: hashed }
    });

    if (client && client.isActive) {
      req.clientName = client.name;
      req.clientId = client.id;

      // Update last used timestamp asynchronously
      prisma.apiClient.update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() }
      }).catch(err => logger.error({ err }, 'Failed to update client lastUsedAt'));

      return next();
    }
  } catch (error) {
    logger.error({ error }, 'Error during API key verification');
  }

  res.status(403).json({
    success: false,
    data: null,
    error: {
      code: 'AUTH_ERROR',
      message: 'Invalid or revoked API key'
    },
    requestId: req.requestId || 'req_unknown'
  });
}
