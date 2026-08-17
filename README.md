# 📱 TFC WhatsApp Automation Service (`tfc-whatsapp-service`)

> **Production-Ready, Loosely-Coupled WhatsApp Automation Microservice for The Foundation Collegiate (TFC) Portal**

---

## 🏛️ 1. Core Architecture

```
                      +-----------------------------+
                      |     TFC Main Application    |
                      |   (Admin Panel / Portal)    |
                      +-----------------------------+
                                     |
                                     | HTTPS REST API (x-api-key authenticated)
                                     v
                      +-----------------------------+
                      |   TFC WhatsApp Service API  |
                      |      (Control Plane)        |
                      +-----------------------------+
                                     |
                +--------------------+--------------------+
                |                                         |
                v                                         v
   +-------------------------+               +-------------------------+
   |   Dedicated PostgreSQL  |               |       Redis Broker      |
   |   (Separate Supabase)   |               |         (BullMQ)        |
   +-------------------------+               +-------------------------+
                                                          |
                                                          | Queued Jobs
                                                          v
                                             +-------------------------+
                                             | Persistent Baileys      |
                                             | WhatsApp Worker         |
                                             | (Docker / VPS / Cloud)  |
                                             +-------------------------+
                                                          |
                                                          | Baileys Multi-Device
                                                          v
                                                   WhatsApp Web
```

### 🔒 Architectural Principles
1. **Loose Coupling**: The TFC main application and the WhatsApp service have **zero shared database dependencies**.
2. **Dedicated Database**: This service runs on its own isolated Supabase PostgreSQL instance.
3. **Split Plane Design**:
   - **API / Control Plane**: Stateless Express/TypeScript API that validates requests, manages schedules, and enqueues jobs (deployable to Vercel or any container).
   - **Persistent Worker**: Stateful Baileys worker running in a persistent container or VPS to maintain active WhatsApp Web WebSocket connections and handle message queues with rate limiting.

---

## 🚀 2. Technology Stack

- **Runtime**: Node.js 20+ / TypeScript 5.7+
- **Framework**: Express 4 with modular router architecture
- **Database & ORM**: PostgreSQL via dedicated Supabase project with Prisma ORM
- **Queue System**: Redis 7 + BullMQ
- **WhatsApp Web Engine**: `@whiskeysockets/baileys` (Multi-Device)
- **Security & Headers**: Helmet, CORS, rate-limiting, AES-256-GCM encryption, SHA-256 API key hashing
- **Validation**: Zod schema validation
- **Logging**: Pino structured JSON logger with automatic secret redaction

---

## ⚙️ 3. Environment Variables

Create a `.env` file from `.env.example`:

```bash
# Server Environment
NODE_ENV=production
PORT=4000

# Dedicated Supabase / PostgreSQL (Separate from TFC DB)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Supabase API
SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_PUBLISHABLE_KEY="[PUBLISHABLE-KEY]"
SUPABASE_SERVICE_ROLE_KEY="[SERVICE-ROLE-KEY]"

# Redis
REDIS_URL="redis://localhost:6379"

# Service-to-Service Secret Authentication Key
TFC_SERVICE_API_KEY="tfc_live_secret_service_key_change_in_production"

# AES-256 Encryption Key for Sessions
WHATSAPP_SESSION_ENCRYPTION_KEY="replace_with_a_secure_random_32_character_key"

# Operational
LOG_LEVEL="info"
CORS_ORIGIN="*"
SESSIONS_STORAGE_DIR="./data/sessions"
```

> ⚠️ **IMPORTANT**: Never commit `.env` files. Ensure secrets are supplied via your deployment platform's secret manager.

---

## 🛠️ 4. Local Installation & Development

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Push Prisma Schema to Supabase
```bash
npx prisma generate
npx prisma db push
```

### Step 3: Run Automated Test Suite
```bash
npm test
```

### Step 4: Start Services Locally

**Option A: Using Docker Compose (Recommended)**
```bash
docker-compose up --build
```

**Option B: Running Processes Directly**
```bash
# Terminal 1 - Start API Server
npm run dev

# Terminal 2 - Start Persistent Worker
npm run dev:worker
```

---

## 🌐 5. REST API Reference

All requests must include the header:
```http
x-api-key: <TFC_SERVICE_API_KEY>
```

### Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Public service liveness health check |
| `GET` | `/api/v1/status` | Authenticated system diagnostic status (DB, Redis, Queues) |
| `POST` | `/api/v1/accounts` | Register a new WhatsApp sender account |
| `GET` | `/api/v1/accounts` | List registered WhatsApp accounts |
| `GET` | `/api/v1/accounts/:id` | Get account details and connection status |
| `POST` | `/api/v1/accounts/:id/connect` | Initialize WhatsApp session & request QR code |
| `GET` | `/api/v1/accounts/:id/qr` | Retrieve Base64 DataURL QR code for scanning |
| `POST` | `/api/v1/accounts/:id/disconnect` | Gracefully log out and disconnect session |
| `POST` | `/api/v1/messages/send` | Queue single message for immediate delivery |
| `POST` | `/api/v1/messages/bulk` | Queue batch messages with rate-pacing |
| `POST` | `/api/v1/messages/schedule` | Schedule a future WhatsApp message |
| `GET` | `/api/v1/messages` | Paginated message log and delivery status |
| `GET` | `/api/v1/messages/:id` | Get message delivery history and retry attempts |
| `POST` | `/api/v1/messages/:id/retry` | Re-enqueue a failed message |
| `GET` | `/api/v1/contacts` | List contacts with message counts |
| `POST` | `/api/v1/contacts` | Upsert contact entry |
| `POST` | `/api/v1/automations/trigger` | Trigger institutional automation (Admission, Fee, Result, Attendance) |

---

## 🎓 6. TFC Admin Panel Integration Code Snippet

To call this service from the existing TFC Admin Panel backend, use this clean TypeScript client:

```typescript
// lib/tfcWhatsAppClient.ts
export class TfcWhatsAppClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.WHATSAPP_SERVICE_URL || 'https://whatsapp.foundationcollegiate.edu.pk';
    this.apiKey = process.env.TFC_SERVICE_API_KEY || '';
  }

  // 1. Send Single WhatsApp Message
  async sendMessage(accountId: string, recipient: string, messageBody: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({ accountId, recipient, messageBody })
    });
    return res.json();
  }

  // 2. Trigger Result Notification
  async sendResultAlert(recipient: string, studentData: {
    studentName: string;
    examName: string;
    obtainedMarks: number;
    totalMarks: number;
    percentage: number;
    grade: string;
    position?: string;
    pin?: string;
  }) {
    const res = await fetch(`${this.baseUrl}/api/v1/automations/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        triggerType: 'RESULT_NOTIFICATION',
        recipient,
        variables: studentData
      })
    });
    return res.json();
  }

  // 3. Trigger Fee Due Reminder
  async sendFeeReminder(recipient: string, feeData: {
    studentName: string;
    className: string;
    challanNo: string;
    totalAmount: string;
    dueDate: string;
  }) {
    const res = await fetch(`${this.baseUrl}/api/v1/automations/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        triggerType: 'FEE_DUE_REMINDER',
        recipient,
        variables: feeData
      })
    });
    return res.json();
  }
}
```

---

## 🚢 7. Production Deployment Guide

### A. Deploying the API (Control Plane) to Vercel
1. Push the repository to GitHub: `https://github.com/hihacc/foundation-whatsapp`
2. Import the project in Vercel.
3. Configure Environment Variables in Vercel Settings:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `REDIS_URL` (e.g. Upstash Redis)
   - `TFC_SERVICE_API_KEY`
   - `WHATSAPP_SESSION_ENCRYPTION_KEY`
4. Deploy! The API control plane is live.

### B. Deploying the Persistent Baileys Worker (Docker / VPS)
The WhatsApp worker must run on a persistent container or VPS to maintain WebSocket state:

```bash
# Build and run worker with persistent volume mount
docker build -f Dockerfile.worker -t tfc-whatsapp-worker .

docker run -d \
  --name tfc-whatsapp-worker \
  --restart unless-stopped \
  -v tfc_sessions:/app/data/sessions \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -e WHATSAPP_SESSION_ENCRYPTION_KEY="..." \
  tfc-whatsapp-worker
```

---

## 🛡️ 8. Security & Secret Hygiene Checklist

- [x] Zero hard-coded credentials or passwords in source code
- [x] Dedicated, isolated Supabase database instance
- [x] AES-256-GCM encryption for stored WhatsApp session references
- [x] SHA-256 hashed API key authentication
- [x] Automated secret redaction in all Pino logging output
- [x] Sliding-window rate-limiting on message dispatch endpoints
- [x] Server-to-server authorization layer

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
