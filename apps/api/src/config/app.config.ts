import { registerAs } from '@nestjs/config';

/**
 * Typed, namespaced config (≈ Spring's @ConfigurationProperties("app")).
 *
 * Consume it type-safely either way:
 *   - Injected namespace (preferred inside services):
 *       constructor(
 *         @Inject(appConfig.KEY)
 *         private readonly cfg: ConfigType<typeof appConfig>,
 *       ) {}
 *   - Or via ConfigService:
 *       configService.getOrThrow<number>('app.port')
 *
 * Values here are already guaranteed valid because `validateEnv` (env.schema.ts)
 * runs first and blocks bootstrap on any invalid value.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
}

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv:
      (process.env.NODE_ENV as AppConfig['nodeEnv'] | undefined) ??
      'development',
    port: Number(process.env.PORT ?? 3000),
  }),
);
