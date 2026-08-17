import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  proto
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { WhatsAppSessionStore } from './sessionStore.js';
import { prisma } from '../../src/lib/prisma.js';
import { logger } from '../../src/lib/logger.js';

export interface WhatsAppClientCallbacks {
  onQrCode?: (qrBase64: string) => void;
  onConnected?: (phoneNumber?: string) => void;
  onDisconnected?: (reason: string, shouldReconnect: boolean) => void;
}

export class WhatsAppClient {
  public socket: WASocket | null = null;
  public accountId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async initialize(): Promise<WASocket> {
    if (this.isConnecting && this.socket) {
      return this.socket;
    }

    this.isConnecting = true;
    logger.info({ accountId: this.accountId }, 'Initializing Baileys WhatsApp client');

    const { state, saveCreds } = await WhatsAppSessionStore.getAuthState(this.accountId);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] as [number, number, number], isLatest: true }));

    logger.debug({ accountId: this.accountId, version, isLatest }, 'Using Baileys version');

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['The Foundation Collegiate', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      generateHighQualityLinkPreview: true
    });

    this.socket = sock;

    // Handle credentials updates
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info({ accountId: this.accountId }, 'Received WhatsApp login QR Code');
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          await prisma.whatsAppAccount.update({
            where: { id: this.accountId },
            data: {
              status: 'SCAN_QR',
              connected: false,
              qrCode: qrDataUrl
            }
          });
        } catch (qrErr) {
          logger.error({ qrErr }, 'Failed to convert QR code to DataURL');
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        const userJid = sock.user?.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];

        logger.info({ accountId: this.accountId, phone }, '✅ WhatsApp connection established (OPEN)');

        await prisma.whatsAppAccount.update({
          where: { id: this.accountId },
          data: {
            status: 'CONNECTED',
            connected: true,
            phoneNumber: phone || undefined,
            qrCode: null,
            lastSeenAt: new Date()
          }
        });

        await prisma.whatsAppSession.updateMany({
          where: { accountId: this.accountId },
          data: {
            sessionStatus: 'AUTHENTICATED',
            lastConnectedAt: new Date()
          }
        });
      }

      if (connection === 'close') {
        this.isConnecting = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isLoggedOut && this.reconnectAttempts < this.maxReconnectAttempts;

        logger.warn({
          accountId: this.accountId,
          statusCode,
          isLoggedOut,
          shouldReconnect,
          attempt: this.reconnectAttempts
        }, 'WhatsApp connection closed');

        await prisma.whatsAppAccount.update({
          where: { id: this.accountId },
          data: {
            status: 'DISCONNECTED',
            connected: false,
            qrCode: null
          }
        });

        await prisma.whatsAppSession.updateMany({
          where: { accountId: this.accountId },
          data: {
            sessionStatus: isLoggedOut ? 'EXPIRED' : 'INACTIVE',
            lastDisconnectedAt: new Date()
          }
        });

        if (isLoggedOut) {
          await WhatsAppSessionStore.clearSession(this.accountId);
        } else if (shouldReconnect) {
          this.reconnectAttempts += 1;
          const delay = Math.min(this.reconnectAttempts * 3000, 30000);
          logger.info({ accountId: this.accountId, delay }, `Attempting reconnect in ${delay}ms...`);
          setTimeout(() => this.initialize(), delay);
        }
      }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue;

        try {
          const sender = (m.key.remoteJid || '').replace('@s.whatsapp.net', '');
          const text = m.message.conversation ||
                       m.message.extendedTextMessage?.text ||
                       m.message.imageMessage?.caption || '';

          if (sender && text) {
            await prisma.incomingMessage.create({
              data: {
                accountId: this.accountId,
                senderPhoneNumber: sender,
                messageBody: text,
                messageType: 'TEXT',
                rawPayload: m as any
              }
            });
            logger.info({ accountId: this.accountId, sender }, 'Recorded incoming WhatsApp message');
          }
        } catch (inErr) {
          logger.error({ inErr }, 'Failed to record incoming message');
        }
      }
    });

    return sock;
  }

  async sendTextMessage(recipient: string, text: string): Promise<{ messageId?: string }> {
    if (!this.socket) {
      throw new Error(`WhatsApp socket not initialized for account ${this.accountId}`);
    }

    const jid = recipient.includes('@s.whatsapp.net') ? recipient : `${recipient}@s.whatsapp.net`;
    const result = await this.socket.sendMessage(jid, { text });

    return {
      messageId: result?.key?.id || undefined
    };
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch {}
      this.socket.end(undefined);
      this.socket = null;
    }
  }
}
