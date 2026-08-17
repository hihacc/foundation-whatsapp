import { prisma } from '../../lib/prisma.js';
import { sessionQueue } from '../../lib/queues.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logger } from '../../lib/logger.js';

export class AccountsService {
  static async createAccount(name: string, phoneNumber?: string) {
    const account = await prisma.whatsAppAccount.create({
      data: {
        name,
        phoneNumber,
        status: 'DISCONNECTED',
        connected: false
      }
    });

    // Create associated session record
    await prisma.whatsAppSession.create({
      data: {
        accountId: account.id,
        sessionStatus: 'INACTIVE'
      }
    });

    logger.info({ accountId: account.id, name }, 'WhatsApp account registered');
    return account;
  }

  static async listAccounts() {
    return prisma.whatsAppAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        status: true,
        connected: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  static async getAccountById(id: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id },
      include: {
        sessions: {
          select: {
            sessionStatus: true,
            lastConnectedAt: true,
            lastDisconnectedAt: true
          }
        },
        _count: {
          select: {
            messages: true,
            contacts: true,
            scheduledMessages: true
          }
        }
      }
    });

    if (!account) {
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', `WhatsApp Account with ID "${id}" was not found.`);
    }

    return account;
  }

  static async triggerConnect(id: string) {
    const account = await this.getAccountById(id);

    // Update account state to CONNECTING
    await prisma.whatsAppAccount.update({
      where: { id },
      data: { status: 'CONNECTING' }
    });

    // Enqueue session control job for the persistent worker
    await sessionQueue.add(`connect-${id}`, {
      accountId: id,
      action: 'CONNECT'
    }, {
      jobId: `session-connect-${id}-${Date.now()}`
    });

    logger.info({ accountId: id }, 'Enqueued session CONNECT job to worker');
    return { status: 'CONNECTING', message: 'Connection initialization triggered on worker. Poll QR endpoint to retrieve login QR code.' };
  }

  static async getQrCode(id: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, connected: true, qrCode: true }
    });

    if (!account) {
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', `WhatsApp Account with ID "${id}" was not found.`);
    }

    return {
      accountId: account.id,
      name: account.name,
      status: account.status,
      connected: account.connected,
      qrCode: account.qrCode || null
    };
  }

  static async triggerDisconnect(id: string) {
    const account = await this.getAccountById(id);

    await sessionQueue.add(`disconnect-${id}`, {
      accountId: id,
      action: 'DISCONNECT'
    });

    await prisma.whatsAppAccount.update({
      where: { id },
      data: {
        status: 'DISCONNECTED',
        connected: false,
        qrCode: null
      }
    });

    return { status: 'DISCONNECTED', message: 'WhatsApp session disconnected successfully.' };
  }
}
