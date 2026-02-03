import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';

config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  SOLIDES_API_URL: z.string().url(),
  SOLIDES_API_TOKEN: z.string().min(1),
  SOLIDES_COMPANY_ID: z.string().min(1),

  // Firebase — use base64-encoded JSON (recommended for Render)
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  SLACK_BOT_TOKEN: z.string().default(''),
  SLACK_SIGNING_SECRET: z.string().default(''),
  SLACK_APP_TOKEN: z.string().default(''),
  SLACK_TEST_USER_ID: z.string().default('U0895CZ8HU7'),

  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
