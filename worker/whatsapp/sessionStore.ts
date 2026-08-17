import fs from 'fs';
import path from 'path';
import { useMultiFileAuthState, AuthenticationState } from '@whiskeysockets/baileys';
import { env } from '../../src/config/env.js';
import { logger } from '../../src/lib/logger.js';

export class WhatsAppSessionStore {
  static getSessionDir(accountId: string): string {
    const baseDir = path.resolve(process.cwd(), env.SESSIONS_STORAGE_DIR || './data/sessions');
    const accountDir = path.join(baseDir, accountId);

    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true });
    }

    return accountDir;
  }

  static async getAuthState(accountId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const sessionDir = this.getSessionDir(accountId);
    logger.debug({ accountId, sessionDir }, 'Initializing Baileys MultiFileAuthState');
    return useMultiFileAuthState(sessionDir);
  }

  static async clearSession(accountId: string): Promise<void> {
    const sessionDir = this.getSessionDir(accountId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info({ accountId }, 'Cleared WhatsApp local session directory');
    }
  }
}
