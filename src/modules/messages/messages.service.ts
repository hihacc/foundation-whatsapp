import { prisma } from '../../lib/prisma.js';
import { sendQueue, bulkSendQueue, retryQueue, scheduledQueue } from '../../lib/queues.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logger } from '../../lib/logger.js';

export class MessagesService {
  /**
   * Normalize Pakistani and international phone numbers to WhatsApp JID format
   */
  static cleanPhoneNumber(phone: string): string {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('03')) {
      clean = '92' + clean.slice(1);
    } else if (clean.startsWith('0092')) {
      clean = clean.slice(2);
    } else if (clean.startsWith('923') && clean.length === 12) {
      // standard PK format
    }
    return clean;
  }

  static async sendMessage(data: {
    accountId: string;
    recipient: string;
    messageBody: string;
    messageType?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'TEMPLATE' | 'LOCATION';
    metadata?: Record<string, any>;
  }) {
    const cleanedRecipient = this.cleanPhoneNumber(data.recipient);
    if (!cleanedRecipient || cleanedRecipient.length < 10) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid recipient phone number: ${data.recipient}`);
    }

    // 1. Verify account exists
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: data.accountId }
    });

    if (!account) {
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', `WhatsApp Account "${data.accountId}" not found`);
    }

    // 2. Upsert contact if not present
    let contact = await prisma.contact.findUnique({
      where: {
        accountId_phoneNumber: {
          accountId: data.accountId,
          phoneNumber: cleanedRecipient
        }
      }
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          accountId: data.accountId,
          phoneNumber: cleanedRecipient,
          name: data.metadata?.recipientName || `Contact ${cleanedRecipient.slice(-4)}`
        }
      });
    }

    // 3. Create message record with QUEUED status
    const message = await prisma.message.create({
      data: {
        accountId: data.accountId,
        contactId: contact.id,
        recipient: cleanedRecipient,
        messageBody: data.messageBody,
        messageType: data.messageType || 'TEXT',
        status: 'QUEUED',
        metadata: data.metadata || {}
      }
    });

    // 4. Enqueue to BullMQ for asynchronous persistent worker processing
    await sendQueue.add(`send-${message.id}`, {
      messageId: message.id,
      accountId: message.accountId,
      recipient: cleanedRecipient,
      messageType: message.messageType,
      messageBody: message.messageBody,
      metadata: data.metadata,
      attemptNumber: 1
    }, {
      jobId: `msg-${message.id}`
    });

    logger.info({ messageId: message.id, recipient: cleanedRecipient }, 'WhatsApp message queued for delivery');

    return message;
  }

  static async sendBulkMessages(data: {
    accountId: string;
    messages: Array<{
      recipient: string;
      messageBody: string;
      metadata?: Record<string, any>;
    }>;
  }) {
    const batchId = `batch_${Date.now()}`;
    const queuedMessages = [];

    for (const item of data.messages) {
      const msg = await this.sendMessage({
        accountId: data.accountId,
        recipient: item.recipient,
        messageBody: item.messageBody,
        metadata: { ...item.metadata, batchId }
      });
      queuedMessages.push(msg);
    }

    return {
      batchId,
      totalQueued: queuedMessages.length,
      messages: queuedMessages.map(m => ({ id: m.id, recipient: m.recipient, status: m.status }))
    };
  }

  static async scheduleMessage(data: {
    accountId: string;
    recipient: string;
    messageBody: string;
    scheduledAt: string | Date;
    metadata?: Record<string, any>;
  }) {
    const runAt = new Date(data.scheduledAt);
    const delay = runAt.getTime() - Date.now();

    if (delay <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'scheduledAt must be a future timestamp');
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        accountId: data.accountId,
        recipient: this.cleanPhoneNumber(data.recipient),
        messageBody: data.messageBody,
        scheduledAt: runAt,
        status: 'QUEUED',
        metadata: data.metadata || {}
      }
    });

    // Enqueue delayed job in BullMQ
    await scheduledQueue.add(`scheduled-${scheduled.id}`, {
      messageId: scheduled.id,
      accountId: scheduled.accountId,
      recipient: scheduled.recipient,
      messageType: 'TEXT',
      messageBody: scheduled.messageBody,
      metadata: data.metadata
    }, {
      delay,
      jobId: `scheduled-${scheduled.id}`
    });

    return scheduled;
  }

  static async listMessages(filters: {
    accountId?: string;
    status?: any;
    limit?: number;
    offset?: number;
  }) {
    const { accountId, status, limit = 50, offset = 0 } = filters;

    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;

    const [total, messages] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: {
            select: { name: true, phoneNumber: true }
          }
        }
      })
    ]);

    return { total, limit, offset, messages };
  }

  static async getMessageById(id: string) {
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        attempts: {
          orderBy: { attemptedAt: 'asc' }
        },
        contact: true,
        account: {
          select: { name: true, status: true, connected: true }
        }
      }
    });

    if (!message) {
      throw new AppError(404, 'MESSAGE_FAILED', `Message with ID "${id}" was not found.`);
    }

    return message;
  }

  static async retryMessage(id: string) {
    const message = await this.getMessageById(id);

    if (message.status === 'SENT' || message.status === 'DELIVERED') {
      throw new AppError(400, 'MESSAGE_FAILED', 'Cannot retry a message that has already been delivered.');
    }

    const updated = await prisma.message.update({
      where: { id },
      data: {
        status: 'QUEUED',
        retryCount: { increment: 1 }
      }
    });

    await retryQueue.add(`retry-${id}`, {
      messageId: message.id,
      accountId: message.accountId,
      recipient: message.recipient,
      messageType: message.messageType,
      messageBody: message.messageBody,
      metadata: (message.metadata as any) || {},
      attemptNumber: message.retryCount + 1
    }, {
      jobId: `retry-${message.id}-${Date.now()}`
    });

    return updated;
  }
}
