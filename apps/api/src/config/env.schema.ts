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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
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
