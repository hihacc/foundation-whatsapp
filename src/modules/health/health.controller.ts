import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { redisConnection } from '../../lib/redis.js';
import { sendQueue, bulkSendQueue, scheduledQueue, retryQueue } from '../../lib/queues.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';

export class HealthController {
  // Public basic liveness probe
  static async getHealth(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        status: 'UP',
        service: 'tfc-whatsapp-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      },
      error: null,
      requestId: req.requestId
    });
  }

  // Detailed operational status (Authenticated)
  static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Database check
      let dbConnected = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbConnected = true;
      } catch {}

      // 2. Redis check
      const redisStatus = redisConnection.status === 'ready';

      // 3. Queue metrics
      const [sendWaiting, bulkWaiting, scheduledWaiting, retryWaiting] = await Promise.all([
        sendQueue.getWaitingCount().catch(() => 0),
        bulkSendQueue.getWaitingCount().catch(() => 0),
        scheduledQueue.getWaitingCount().catch(() => 0),
        retryQueue.getWaitingCount().catch(() => 0),
      ]);

      // 4. Accounts status summary
      const [totalAccounts, connectedAccounts] = await Promise.all([
        prisma.whatsAppAccount.count().catch(() => 0),
        prisma.whatsAppAccount.count({ where: { connected: true } }).catch(() => 0),
      ]);

      res.json({
        success: true,
        data: {
          service: 'tfc-whatsapp-service',
          environment: process.env.NODE_ENV,
          uptimeSeconds: Math.floor(process.uptime()),
          checks: {
            database: dbConnected ? 'HEALTHY' : 'UNHEALTHY',
            redis: redisStatus ? 'HEALTHY' : 'UNHEALTHY',
            worker: 'ACTIVE'
          },
          whatsapp: {
            totalAccounts,
            connectedAccounts
          },
          queues: {
            sendWaiting,
            bulkWaiting,
            scheduledWaiting,
            retryWaiting
          }
        },
        error: null,
        requestId: req.requestId
      });
    } catch (error) {
      next(error);
    }
  }
}
