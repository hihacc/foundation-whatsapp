import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { MessagesService } from '../messages/messages.service.js';
import { logger } from '../../lib/logger.js';

export class AutomationsService {
  /**
   * Helper to replace template placeholders like {{studentName}} with variables
   */
  static renderTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  static async listRules(accountId?: string) {
    const where: any = {};
    if (accountId) where.accountId = accountId;

    return prisma.automationRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        account: {
          select: { name: true, connected: true }
        }
      }
    });
  }

  static async createRule(data: {
    accountId: string;
    triggerType: 'ADMISSION_CONFIRMATION' | 'FEE_DUE_REMINDER' | 'ATTENDANCE_ALERT' | 'RESULT_NOTIFICATION' | 'ANNOUNCEMENT' | 'CUSTOM_EVENT';
    name: string;
    template: string;
    conditions?: Record<string, any>;
  }) {
    return prisma.automationRule.create({
      data: {
        accountId: data.accountId,
        triggerType: data.triggerType,
        name: data.name,
        template: data.template,
        conditions: data.conditions || {},
        isActive: true
      }
    });
  }

  static async updateRule(id: string, data: {
    name?: string;
    template?: string;
    isActive?: boolean;
    conditions?: Record<string, any>;
  }) {
    return prisma.automationRule.update({
      where: { id },
      data
    });
  }

  static async deleteRule(id: string) {
    return prisma.automationRule.delete({
      where: { id }
    });
  }

  /**
   * Trigger automation from TFC Portal (e.g. Admission confirmation, Fee reminder, Result notification)
   */
  static async triggerAutomation(data: {
    triggerType: 'ADMISSION_CONFIRMATION' | 'FEE_DUE_REMINDER' | 'ATTENDANCE_ALERT' | 'RESULT_NOTIFICATION' | 'ANNOUNCEMENT' | 'CUSTOM_EVENT';
    recipient: string;
    variables: Record<string, any>;
    accountId?: string;
    customTemplate?: string;
  }) {
    // 1. Resolve WhatsApp Account
    let accountId = data.accountId;

    if (!accountId) {
      const activeAccount = await prisma.whatsAppAccount.findFirst({
        where: { connected: true }
      });

      if (!activeAccount) {
        throw new AppError(400, 'WHATSAPP_NOT_CONNECTED', 'No connected WhatsApp account available to process automation.');
      }
      accountId = activeAccount.id;
    }

    if (!accountId) {
      throw new AppError(400, 'ACCOUNT_NOT_FOUND', 'Unable to determine target WhatsApp account.');
    }

    // 2. Find matching automation rule template if not explicitly provided
    let messageBody = '';
    if (data.customTemplate) {
      messageBody = this.renderTemplate(data.customTemplate, data.variables);
    } else {
      const rule = await prisma.automationRule.findFirst({
        where: {
          accountId,
          triggerType: data.triggerType,
          isActive: true
        }
      });

      if (rule) {
        messageBody = this.renderTemplate(rule.template, data.variables);
      } else {
        // Fallback default message templates for standard TFC institutional workflows
        messageBody = this.getDefaultTemplate(data.triggerType, data.variables);
      }
    }

    // 3. Dispatch message via MessagesService
    const queued = await MessagesService.sendMessage({
      accountId,
      recipient: data.recipient,
      messageBody,
      metadata: {
        automationTrigger: data.triggerType,
        variables: data.variables
      }
    });

    logger.info({ trigger: data.triggerType, messageId: queued.id, recipient: data.recipient }, 'TFC Automation dispatched');

    return {
      success: true,
      messageId: queued.id,
      triggerType: data.triggerType,
      renderedMessage: messageBody,
      status: queued.status
    };
  }

  private static getDefaultTemplate(trigger: string, v: Record<string, any>): string {
    switch (trigger) {
      case 'ADMISSION_CONFIRMATION':
        return `🎓 *THE FOUNDATION COLLEGIATE*\n\nDear ${v.parentName || 'Parent'},\nWe are pleased to confirm the admission of *${v.studentName}* into Class *${v.className}*.\n\n*Roll No:* ${v.rollNumber || 'Assigned soon'}\n*Portal Access:* https://foundationcollegiate.edu.pk\n\nThank you for choosing TFC.`;

      case 'FEE_DUE_REMINDER':
        return `💳 *THE FOUNDATION COLLEGIATE - FEE REMINDER*\n\nDear Parent,\nFee Challan *#${v.challanNo}* for *${v.studentName}* (Class ${v.className}) of *Rs. ${v.totalAmount}* is due on *${v.dueDate}*.\n\nPlease ensure payment before the due date to avoid late surcharges.`;

      case 'ATTENDANCE_ALERT':
        return `⚠️ *TFC ATTENDANCE NOTICE*\n\nDear Parent,\nYour ward *${v.studentName}* (Roll: ${v.rollNumber}) was marked *ABSENT* today (*${v.date || new Date().toLocaleDateString()}*).\n\nIf this was an informed leave, please submit a written application to the administration.`;

      case 'RESULT_NOTIFICATION':
        return `📊 *TFC EXAMINATION RESULTS PUBLISHED*\n\nDear Parent,\nThe result for *${v.studentName}* for *${v.examName}* has been officially published.\n\n*Obtained Marks:* ${v.obtainedMarks}/${v.totalMarks} (${v.percentage}%)\n*Grade:* ${v.grade} | *Position:* ${v.position || 'N/A'}\n*Portal PIN:* ${v.pin || 'Check portal'}\n\nView full marksheet: https://foundationcollegiate.edu.pk/results`;

      case 'ANNOUNCEMENT':
      default:
        return `📢 *THE FOUNDATION COLLEGIATE NOTICE*\n\n${v.noticeText || v.message || 'Important administrative announcement from TFC administration.'}`;
    }
  }
}
