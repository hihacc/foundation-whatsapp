import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

export const QUEUE_NAMES = {
  WHATSAPP_SEND: 'whatsapp-send',
  WHATSAPP_BULK_SEND: 'whatsapp-bulk-send',
  WHATSAPP_SCHEDULED: 'whatsapp-scheduled',
  WHATSAPP_RETRY: 'whatsapp-retry',
  WHATSAPP_SESSION: 'whatsapp-session'
} as const;

export interface SendMessageJobPayload {
  messageId: string;
  accountId: string;
  recipient: string;
  messageType: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'TEMPLATE' | 'LOCATION';
  messageBody: string;
  metadata?: Record<string, any>;
  attemptNumber?: number;
}

export interface BulkSendJobPayload {
  accountId: string;
  recipients: Array<{
    recipient: string;
    messageBody: string;
    metadata?: Record<string, any>;
  }>;
  batchId: string;
}

export interface SessionControlJobPayload {
  accountId: string;
  action: 'CONNECT' | 'DISCONNECT' | 'RECONNECT' | 'SYNC_STATUS';
}

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

// Queue instances
export const sendQueue = new Queue<SendMessageJobPayload>(QUEUE_NAMES.WHATSAPP_SEND, {
  connection: redisConnection,
  defaultJobOptions,
});

export const bulkSendQueue = new Queue<BulkSendJobPayload>(QUEUE_NAMES.WHATSAPP_BULK_SEND, {
  connection: redisConnection,
  defaultJobOptions,
});

export const scheduledQueue = new Queue<SendMessageJobPayload>(QUEUE_NAMES.WHATSAPP_SCHEDULED, {
  connection: redisConnection,
  defaultJobOptions,
});

export const retryQueue = new Queue<SendMessageJobPayload>(QUEUE_NAMES.WHATSAPP_RETRY, {
  connection: redisConnection,
  defaultJobOptions,
});

export const sessionQueue = new Queue<SessionControlJobPayload>(QUEUE_NAMES.WHATSAPP_SESSION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: true,
  },
});
