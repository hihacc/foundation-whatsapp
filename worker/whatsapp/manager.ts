import { WhatsAppClient } from './client.js';
import { prisma } from '../../src/lib/prisma.js';
import { logger } from '../../src/lib/logger.js';

export class WhatsAppClientManager {
  private static clients = new Map<string, WhatsAppClient>();

  static async getClient(accountId: string): Promise<WhatsAppClient> {
    let client = this.clients.get(accountId);

    if (!client) {
      client = new WhatsAppClient(accountId);
      this.clients.set(accountId, client);
      await client.initialize();
    }

    return client;
  }

  static async initClient(accountId: string): Promise<WhatsAppClient> {
    const client = new WhatsAppClient(accountId);
    this.clients.set(accountId, client);
    await client.initialize();
    return client;
  }

  static async disconnectClient(accountId: string): Promise<void> {
    const client = this.clients.get(accountId);
    if (client) {
      await client.disconnect();
      this.clients.delete(accountId);
      logger.info({ accountId }, 'Removed active WhatsApp client from manager');
    }
  }

  static async restoreAllConnectedSessions(): Promise<void> {
    try {
      const accounts = await prisma.whatsAppAccount.findMany({
        where: {
          OR: [
            { connected: true },
            { status: 'CONNECTED' },
            { status: 'CONNECTING' }
          ]
        }
      });

      logger.info({ count: accounts.length }, 'Restoring active WhatsApp account sessions on worker startup');

      for (const acc of accounts) {
        try {
          await this.getClient(acc.id);
        } catch (err) {
          logger.error({ accountId: acc.id, err }, 'Failed to restore WhatsApp session');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error restoring account sessions');
    }
  }
}
