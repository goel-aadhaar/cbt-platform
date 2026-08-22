import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
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
  // Every response here is per-tenant/per-user (auth guards decide WHAT comes
  // back, but the HTTP layer never says so): responses carry an ETag but no
  // Cache-Control, and `Vary` never includes Authorization, so a browser is
  // free to cache a GET by URL alone and replay it for a completely different
  // user/tenant who later hits the same URL from the same profile — a real
  // cross-tenant leak on any shared device/browser profile. `no-store` on
  // every response (not just a Vary fix) is the safe default for an API with
  // no genuinely public, cacheable routes.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
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

  /**
   * OpenAPI docs at /api/docs — off in production unless explicitly asked for.
   *
   * Swagger UI is unauthenticated by construction, so on a public origin it
   * hands an anonymous caller the complete route list, every DTO and every
   * validation rule: a map of the attack surface, published next to the API it
   * describes. Nobody sitting an exam needs it, so the default flips with the
   * environment. `ENABLE_API_DOCS=true` re-enables it for a staging box that
   * happens to run NODE_ENV=production.
   */
  const docsEnabled =
    process.env.ENABLE_API_DOCS === 'true' || config.nodeEnv !== 'production';
  if (docsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Codonmind Nexus API')
      .setDescription('Multi-tenant NTA-style CBT examination platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown (DB pool, pino flush) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);

  const logger = app.get(Logger);
  logger.log(
    `🚀 API ready at http://localhost:${config.port}/api`,
    'Bootstrap',
  );
  logger.log(
    docsEnabled
      ? `📚 Docs at http://localhost:${config.port}/api/docs`
      : '📚 Docs disabled in production (set ENABLE_API_DOCS=true to serve them)',
    'Bootstrap',
  );
}

void bootstrap();
