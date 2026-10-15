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
  FIREBASE_PROJECT_ID: z.string().optional(),

  SLACK_BOT_TOKEN: z.string().default(''),
  SLACK_SIGNING_SECRET: z.string().default(''),
  SLACK_APP_TOKEN: z.string().default(''),
  SLACK_TEST_USER_ID: z.string().default('U0895CZ8HU7'),

  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Authentication
  ADMIN_PASSWORD_HASH: z.string().min(1).optional(), // bcrypt hash of admin password
  JWT_SECRET: z.string().min(32).default('dev-secret-change-in-production-min-32-chars'),
  JWT_EXPIRES_IN: z.string().default('8h'),
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

// The dev defaults are public (they're in this repo): with them anyone can forge an
// admin token or log in with the dev password. Loud warning so it shows in Render logs.
if (isProduction && env.JWT_SECRET === 'dev-secret-change-in-production-min-32-chars') {
  console.error('[security] JWT_SECRET está com o valor padrão de desenvolvimento — configure no Render');
}
if (isProduction && !env.ADMIN_PASSWORD_HASH) {
  console.error('[security] ADMIN_PASSWORD_HASH não configurado — login do RH usa a senha de desenvolvimento');
}
