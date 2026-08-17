import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000').transform(Number),
  
  // Database Configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  // Supabase Configuration
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Redis Configuration for BullMQ
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Service to Service Security
  TFC_SERVICE_API_KEY: z.string().min(8, 'TFC_SERVICE_API_KEY must be at least 8 characters'),
  WHATSAPP_SESSION_ENCRYPTION_KEY: z.string().min(16, 'WHATSAPP_SESSION_ENCRYPTION_KEY must be at least 16 chars').default('tfc-whatsapp-super-secret-key-32b'),

  // Logging & CORS
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  SESSIONS_STORAGE_DIR: z.string().default('./data/sessions')
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ FATAL: Invalid application environment configuration:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
