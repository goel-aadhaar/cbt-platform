import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app.config';
import { configureApp } from './setup';

/**
 * Application entry point (like Spring Boot's main()).
 *
 * Module-level cross-cutting concerns (validation, rate limiting, error
 * envelope) are wired in AppModule so they also apply in tests. HTTP-transport
 * concerns that can only attach to the live server (logger, security headers,
 * CORS, compression, versioning, Swagger) are wired here.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Buffer early logs until pino is attached, so nothing bypasses it.
    bufferLogs: true,
  });

  // Route ALL framework logs through pino (structured + request-scoped).
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Swagger UI (/api/docs) boots from an inline script.
          'script-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(compression());
  app.enableCors({
    origin:
      config.corsOrigins.length > 0
        ? config.corsOrigins
        : config.nodeEnv === 'production'
          ? false
          : true,
    credentials: true,
  });

  // Global prefix + URI versioning → /api, /api/v1 (health/docs version-neutral).
  configureApp(app);

  // OpenAPI docs at /api/docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DRSK CBT API')
    .setDescription('Multi-tenant NTA-style CBT examination platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful shutdown (DB pool, pino flush) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);

  const logger = app.get(Logger);
  logger.log(`🚀 API ready at http://localhost:${config.port}/api`, 'Bootstrap');
  logger.log(
    `📚 Docs at http://localhost:${config.port}/api/docs`,
    'Bootstrap',
  );
}

void bootstrap();
