import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
}

/**
 * Typed 'database' config namespace. DATABASE_URL is guaranteed present and
 * valid at this point because validateEnv (env.schema.ts) gates bootstrap.
 */
export const databaseConfig = registerAs('database', (): DatabaseConfig => ({
  url: process.env.DATABASE_URL as string,
}));
