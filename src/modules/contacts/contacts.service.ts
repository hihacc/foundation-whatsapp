import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { MessagesService } from '../messages/messages.service.js';

export class ContactsService {
  static async listContacts(accountId: string, search?: string) {
    const where: any = { accountId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } }
      ];
    }

    return prisma.contact.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { messages: true }
        }
      }
    });
  }

  static async createContact(accountId: string, name: string, phoneNumber: string, metadata?: Record<string, any>) {
    const cleanPhone = MessagesService.cleanPhoneNumber(phoneNumber);

    return prisma.contact.upsert({
      where: {
        accountId_phoneNumber: {
          accountId,
          phoneNumber: cleanPhone
        }
      },
      create: {
        accountId,
        name,
        phoneNumber: cleanPhone,
        metadata: metadata || {}
      },
      update: {
        name,
        metadata: metadata || {}
      }
    });
  }

  static async getContactById(id: string) {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        messages: {
          take: 20,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!contact) {
      throw new AppError(404, 'VALIDATION_ERROR', `Contact with ID "${id}" was not found.`);
    }

    return contact;
  }
}
