import { z } from 'zod';

/**
 * Treat an EMPTY variable as an absent one.
 *
 * `.env.example` ships the optional settings as bare `KEY=` lines, and a dotenv
 * file has no way to express "unset" other than deleting the line — so an
 * operator who copies the template and fills in only what they need hands the
 * schema `''`, which is not undefined and therefore not optional. Without this
 * the app refuses to boot with "AWS_SES_FROM_EMAIL: Invalid email address" on
 * a variable the operator deliberately left blank.
 */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

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
  PORT: z.coerce.number().int().positive().default(4000),
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
  /**
   * Max PostgreSQL connections in the pool. node-postgres defaults to 10, which
   * starves under an exam-start rush (§2.17 targets 50–200 concurrent
   * candidates). Size it against the database's own connection ceiling.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(25),
  LOG_LEVEL: blankAsUnset(
    z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
  ),
  CORS_ORIGINS: z.string().optional(),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  JWT_PRIVATE_KEY: z.string().min(1, 'base64-encoded RS256 private key (PEM)'),
  JWT_PUBLIC_KEY: z.string().min(1, 'base64-encoded RS256 public key (PEM)'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  /**
   * Login OTP issuance cap per account — a spam/cost bound, not the
   * brute-force control (guessing is capped per-challenge and by the account
   * lockout). See OtpService for why the default is generous.
   */
  OTP_MAX_PER_WINDOW: z.coerce.number().int().positive().default(30),
  OTP_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  /**
   * Email delivery (§2.6). Optional: invite links and OTP codes log to the
   * console until this is set, matching the media module's "S3 the moment a
   * bucket is configured" pattern — MailService switches to the SES adapter
   * the moment a from-address is present.
   */
  AWS_SES_FROM_EMAIL: blankAsUnset(z.string().email().optional()),
  AWS_SES_FROM_NAME: blankAsUnset(z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Placeholder used by the shipped production env templates
 * (`deploy/.env.*.production`) for values only the operator can supply.
 *
 * Most of them are caught anyway because the schema rejects them — `CHANGE_ME`
 * is not a URL, an email, or a Postgres connection string. But the settings the
 * schema treats as optional (`CORS_ORIGINS`, `AWS_S3_BUCKET`) would sail
 * through and fail much later and much less clearly: an unfilled bucket name
 * selects the S3 adapter and then 404s on the first question diagram, and an
 * unfilled origin list blocks every request from a browser that has already
 * loaded the app. Catching the marker itself closes that gap for any variable,
 * including ones added later.
 */
const PLACEHOLDER = 'CHANGE_ME';

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  const issues = result.success
    ? []
    : result.error.issues.map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `  • ${path}: ${issue.message}`;
      });

  /**
   * Only in production: development and test copies are routinely part-filled,
   * and refusing to start over a placeholder there would be obstructive.
   */
  if (config.NODE_ENV === 'production') {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.includes(PLACEHOLDER)) {
        issues.push(
          `  • ${key}: still set to ${PLACEHOLDER} — fill it in before deploying`,
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `\n❌ Invalid environment variables:\n${issues.join('\n')}\n`,
    );
  }

  // Unreachable unless the schema passed, but narrows the type for TypeScript.
  if (!result.success) throw new Error('Invalid environment variables');
  return result.data;
}
