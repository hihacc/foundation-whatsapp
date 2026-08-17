import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { ContactsService } from './contacts.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';

const createContactSchema = z.object({
  accountId: z.string().uuid('Invalid account UUID'),
  name: z.string().min(1, 'Name is required'),
  phoneNumber: z.string().min(8, 'Phone number is required'),
  metadata: z.record(z.any()).optional()
});

export class ContactsController {
  static async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const accountId = req.query.accountId as string;
      const search = req.query.search as string;

      if (!accountId) {
        res.status(400).json({
          success: false,
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'accountId query param is required' },
          requestId: req.requestId
        });
        return;
      }

      const contacts = await ContactsService.listContacts(accountId, search);
      res.json({
        success: true,
        data: contacts,
        error: null,
        requestId: req.requestId
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accountId, name, phoneNumber, metadata } = createContactSchema.parse(req.body);
      const contact = await ContactsService.createContact(accountId, name, phoneNumber, metadata);

      res.status(201).json({
        success: true,
        data: contact,
        error: null,
        requestId: req.requestId
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await ContactsService.getContactById(req.params.id);
      res.json({
        success: true,
        data: contact,
        error: null,
        requestId: req.requestId
      });
    } catch (error) {
      next(error);
    }
  }
}
