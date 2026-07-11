import { z } from 'zod';

/**
 * Single source of truth for environment variables.
 *
 * `@nestjs/config` calls `validateEnv` at bootstrap with the merged env
 * (process.env + .env file). If anything is missing or malformed, the app
 * REFUSES to start and prints exactly what's wrong — fail-fast, so you never
 * run with a half-configured environment in production.
 *
 * This schema grows every phase (DATABASE_URL, AWS_*, JWT_SECRET, ...).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .refine(
      (value) =>
        value.startsWith('postgres://') || value.startsWith('postgresql://'),
      {
        message:
          'must be a PostgreSQL connection string (postgres:// or postgresql://)',
      },
    ),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
  CORS_ORIGINS: z.string().optional(),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  JWT_PRIVATE_KEY: z.string().min(1, 'base64-encoded RS256 private key (PEM)'),
  JWT_PUBLIC_KEY: z.string().min(1, 'base64-encoded RS256 public key (PEM)'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `  • ${path}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(`\n❌ Invalid environment variables:\n${details}\n`);
  }

  return result.data;
}
