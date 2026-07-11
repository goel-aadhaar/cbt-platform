import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildPinoOptions } from './common/logging/pino-logger.config';
import { appConfig } from './config/app.config';
import type { AppConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { BatchesModule } from './modules/batches/batches.module';
import { ClassesModule } from './modules/classes/classes.module';
import { ExamsModule } from './modules/exams/exams.module';
import { InstitutesModule } from './modules/institutes/institutes.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { ResultsModule } from './modules/results/results.module';
import { StudentsModule } from './modules/students/students.module';

/**
 * Root module. Cross-cutting infrastructure is registered globally here so
 * every current and future feature module inherits it:
 *   - ConfigModule  — validated, typed config (global)
 *   - LoggerModule  — pino structured logging (global)
 *   - ThrottlerModule + APP_GUARD — global rate limiting
 *   - APP_PIPE      — global request validation/transformation
 *   - APP_FILTER    — global consistent error envelope
 *   - DatabaseModule — Prisma (global)
 * Feature modules (HealthModule, and later Institute/Auth/Exam/…) live in imports.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig, authConfig],
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
    AuthModule,
    HealthModule,
    InstitutesModule,
    ProgramsModule,
    ClassesModule,
    BatchesModule,
    StudentsModule,
    QuestionsModule,
    ExamsModule,
    AttemptsModule,
    ResultsModule,
  ],
  providers: [
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
