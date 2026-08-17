import { Worker } from 'bullmq';
import { redisConnection } from '../src/lib/redis.js';
import { QUEUE_NAMES } from '../src/lib/queues.js';
import { processSendMessageJob } from './processors/sendProcessor.js';
import { processSessionControlJob } from './processors/sessionProcessor.js';
import { WhatsAppClientManager } from './whatsapp/manager.js';
import { logger } from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';

logger.info('🚀 Starting TFC Persistent WhatsApp Worker Process...');

// 1. WhatsApp Send Queue Worker
const sendWorker = new Worker(
  QUEUE_NAMES.WHATSAPP_SEND,
  processSendMessageJob,
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000 // Rate limit: max 10 messages/second to prevent WhatsApp ban
    }
  }
);

// 2. WhatsApp Scheduled Queue Worker
const scheduledWorker = new Worker(
  QUEUE_NAMES.WHATSAPP_SCHEDULED,
  processSendMessageJob,
  {
    connection: redisConnection,
    concurrency: 5
  }
);

// 3. WhatsApp Retry Queue Worker
const retryWorker = new Worker(
  QUEUE_NAMES.WHATSAPP_RETRY,
  processSendMessageJob,
  {
    connection: redisConnection,
    concurrency: 3
  }
);

// 4. Session Control Worker
const sessionWorker = new Worker(
  QUEUE_NAMES.WHATSAPP_SESSION,
  processSessionControlJob,
  {
    connection: redisConnection,
    concurrency: 2
  }
);

// Setup Worker Event Listeners
[sendWorker, scheduledWorker, retryWorker, sessionWorker].forEach((w) => {
  w.on('completed', (job) => {
    logger.debug({ queue: w.name, jobId: job?.id }, 'Worker job completed');
  });

  w.on('failed', (job, err) => {
    logger.error({ queue: w.name, jobId: job?.id, err: err.message }, 'Worker job failed');
  });

  w.on('error', (err) => {
    logger.error({ queue: w.name, err: err.message }, 'Worker error');
  });
});

// Restore saved sessions on startup
WhatsAppClientManager.restoreAllConnectedSessions().then(() => {
  logger.info('✅ WhatsApp Worker active and listening for BullMQ jobs');
});

// Graceful Shutdown
const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down WhatsApp worker...`);
  
  await Promise.all([
    sendWorker.close(),
    scheduledWorker.close(),
    retryWorker.close(),
    sessionWorker.close(),
  ]);

  await prisma.$disconnect();
  logger.info('All workers and database connections closed gracefully.');
  process.exit(0);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
