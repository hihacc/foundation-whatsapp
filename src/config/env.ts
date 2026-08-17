import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000').transform(Number),
  
  // Database Configuration
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/postgres'),
  DIRECT_URL: z.string().optional(),

  // Supabase Configuration
  SUPABASE_URL: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Redis Configuration for BullMQ
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Service to Service Security
  TFC_SERVICE_API_KEY: z.string().default('tfc_whatsapp_sec_key_2026_live_99x'),
  WHATSAPP_SESSION_ENCRYPTION_KEY: z.string().default('tfc-whatsapp-super-secret-key-32b'),

  // Logging & CORS
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  SESSIONS_STORAGE_DIR: z.string().default('./data/sessions')
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.warn('⚠️ Warning: Environment configuration issues detected, using resilient fallbacks:');
    console.warn(JSON.stringify(parsed.error.format(), null, 2));
    return {
      NODE_ENV: (process.env.NODE_ENV as any) || 'production',
      PORT: 4000,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
      DIRECT_URL: process.env.DIRECT_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      TFC_SERVICE_API_KEY: process.env.TFC_SERVICE_API_KEY || 'tfc_whatsapp_sec_key_2026_live_99x',
      WHATSAPP_SESSION_ENCRYPTION_KEY: process.env.WHATSAPP_SESSION_ENCRYPTION_KEY || 'tfc-whatsapp-super-secret-key-32b',
      LOG_LEVEL: 'info',
      CORS_ORIGIN: '*',
      SESSIONS_STORAGE_DIR: './data/sessions'
    };
  }

  return parsed.data;
}

export const env = validateEnv();
