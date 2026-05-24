import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default(''),
  VNPAY_TMN_CODE: z.string().optional(),
  VNPAY_HASH_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().email().default('noreply@tutor365.local'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  VERIFY_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(24),
  // BOOTSTRAP only — temporary admin auth until V07 JwtAuthGuard + V09 RolesGuard.
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
