import { Job } from 'bullmq';
import { SessionControlJobPayload } from '../../src/lib/queues.js';
import { WhatsAppClientManager } from '../whatsapp/manager.js';
import { logger } from '../../src/lib/logger.js';

export async function processSessionControlJob(job: Job<SessionControlJobPayload>): Promise<void> {
  const { accountId, action } = job.data;

  logger.info({ accountId, action }, 'Worker executing session control job');

  switch (action) {
    case 'CONNECT':
    case 'RECONNECT':
      await WhatsAppClientManager.initClient(accountId);
      break;

    case 'DISCONNECT':
      await WhatsAppClientManager.disconnectClient(accountId);
      break;

    default:
      logger.warn({ action }, 'Unknown session action');
  }
}
