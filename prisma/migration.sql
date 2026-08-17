-- TFC WhatsApp Automation Service - Database Migration SQL
-- Run this SQL in your Supabase SQL Editor: https://supabase.com/dashboard/project/jjdtimkrjpmvkypjtxli/sql/new

-- 1. Create Enums
CREATE TYPE "AccountStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'SCAN_QR', 'CONNECTED', 'BANNED');
CREATE TYPE "SessionStatus" AS ENUM ('INACTIVE', 'PENDING_QR', 'AUTHENTICATED', 'EXPIRED');
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'TEMPLATE', 'LOCATION');
CREATE TYPE "AutomationTriggerType" AS ENUM ('ADMISSION_CONFIRMATION', 'FEE_DUE_REMINDER', 'ATTENDANCE_ALERT', 'RESULT_NOTIFICATION', 'ANNOUNCEMENT', 'CUSTOM_EVENT');

-- 2. Create WhatsApp Accounts Table
CREATE TABLE IF NOT EXISTS "whatsapp_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone_number" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "qr_code" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create WhatsApp Sessions Table
CREATE TABLE IF NOT EXISTS "whatsapp_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
    "session_status" "SessionStatus" NOT NULL DEFAULT 'INACTIVE',
    "session_storage_path" TEXT,
    "encrypted_session_reference" TEXT,
    "last_connected_at" TIMESTAMP(3),
    "last_disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Contacts Table
CREATE TABLE IF NOT EXISTS "contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contacts_account_id_phone_number_key" UNIQUE ("account_id", "phone_number")
);

-- 5. Create Messages Table
CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
    "contact_id" TEXT REFERENCES "contacts"("id") ON DELETE SET NULL,
    "recipient" TEXT NOT NULL,
    "message_type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "message_body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "messages_account_id_status_idx" ON "messages"("account_id", "status");
CREATE INDEX IF NOT EXISTS "messages_recipient_idx" ON "messages"("recipient");

-- 6. Create Message Attempts Table
CREATE TABLE IF NOT EXISTS "message_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
    "attempt_number" INTEGER NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "response_payload" JSONB,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Create Scheduled Messages Table
CREATE TABLE IF NOT EXISTS "scheduled_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
    "recipient" TEXT NOT NULL,
    "message_body" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Create Automation Rules Table
CREATE TABLE IF NOT EXISTS "automation_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
    "trigger_type" "AutomationTriggerType" NOT NULL,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Create Incoming Messages Table
CREATE TABLE IF NOT EXISTS "incoming_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
    "sender_phone_number" TEXT NOT NULL,
    "message_body" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'text',
    "raw_payload" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Create Webhook Events Table
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Create API Clients Table
CREATE TABLE IF NOT EXISTS "api_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL UNIQUE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit" INTEGER NOT NULL DEFAULT 120,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
