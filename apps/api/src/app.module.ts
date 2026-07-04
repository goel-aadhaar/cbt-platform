import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildPinoOptions } from './common/logging/pino-logger.config';
import { appConfig } from './config/app.config';
import type { AppConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';

/**
 * Root module. Cross-cutting infrastructure is registered globally here so
 * every current and future feature module inherits it:
 *   - ConfigModule  — validated, typed config (global)
 *   - LoggerModule  — pino structured logging (global)
 *   - ThrottlerModule + APP_GUARD — global rate limiting
 *   - APP_PIPE      — global request validation/transformation
 *   - APP_FILTER    — global consistent error envelope
 *   - DatabaseModule — Prisma (global)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        return buildPinoOptions({
          nodeEnv: app.nodeEnv,
          logLevel: app.logLevel,
        });
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        return {
          throttlers: [{ ttl: app.throttleTtlMs, limit: app.throttleLimit }],
        };
      },
    }),
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      // Global validation: strip unknown props, reject junk, auto-transform.
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
