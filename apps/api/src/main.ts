import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app.config';

/**
 * Application entry point (like Spring Boot's main()).
 *
 * Module-level cross-cutting concerns (validation, rate limiting, error
 * envelope) are wired in AppModule via APP_PIPE/APP_GUARD/APP_FILTER so they
 * also apply in tests. HTTP-transport concerns that can only be attached to the
 * live server (logger, security headers, CORS, compression) are wired here.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Buffer early logs until pino is attached, so nothing bypasses it.
    bufferLogs: true,
  });

  // Route ALL framework logs through pino (structured + request-scoped).
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');

  // Secure HTTP headers, gzip responses.
  app.use(helmet());
  app.use(compression());

  // CORS: allow-list from env; permissive only in dev (frontend origin TBD).
  app.enableCors({
    origin:
      config.corsOrigins.length > 0
        ? config.corsOrigins
        : config.nodeEnv === 'production'
          ? false
          : true,
    credentials: true,
  });

  // Graceful shutdown (DB pool, pino flush) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);

  app
    .get(Logger)
    .log(`🚀 API ready at http://localhost:${config.port}`, 'Bootstrap');
}

void bootstrap();
