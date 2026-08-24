import { registerAs } from '@nestjs/config';

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevel: string;
  /** Allow-listed CORS origins; empty = allow-all in dev, block in prod. */
  corsOrigins: string[];
  /** Rate-limit window in milliseconds. */
  throttleTtlMs: number;
  /** Max requests per IP per window. */
  throttleLimit: number;
}

/**
 * Typed 'app' config namespace (≈ Spring's @ConfigurationProperties("app")).
 * All values are guaranteed valid because validateEnv (env.schema.ts) gates
 * bootstrap.
 */
export const appConfig = registerAs('app', (): AppConfig => {
  const nodeEnv =
    (process.env.NODE_ENV as NodeEnv | undefined) ?? 'development';

  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 4000),
    /**
     * `||`, not `??`: a present-but-empty `LOG_LEVEL=` is "unset" (that is how
     * env.schema.ts reads it too), but `??` only substitutes for null and
     * undefined, so the empty string would reach pino and abort startup with
     * "default level: must be included in custom levels". This namespace reads
     * raw process.env rather than the validated output, so it has to normalise
     * the blank itself.
     */
    logLevel:
      process.env.LOG_LEVEL?.trim() ||
      (nodeEnv === 'production' ? 'info' : 'debug'),
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    throttleTtlMs: Number(process.env.THROTTLE_TTL_MS ?? 60000),
    throttleLimit: Number(process.env.THROTTLE_LIMIT ?? 120),
  };
});
