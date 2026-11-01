import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),

  MONGODB_URI: z.string().startsWith('mongodb'),
  MONGODB_DB: z.string().min(1).default('ledgerloop'),

  WEB_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim())),
  APP_URL: z.string().url().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** A rotated refresh token still works this long, for responses lost to aborted requests. */
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  /** Load balancers in front of the API (1 on Render), so client IPs come from X-Forwarded-For. */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.string().min(3),

  /** Run the job worker / scheduler inside this process (single-process deployments). */
  RUN_WORKER: bool,
  RUN_SCHEDULER: bool,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
