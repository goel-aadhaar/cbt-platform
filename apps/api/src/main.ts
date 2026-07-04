import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Application entry point (like Spring Boot's main()).
 *
 * Cross-cutting production concerns — global validation pipe, security headers
 * (Helmet), CORS, rate limiting, structured logging, Swagger, API versioning —
 * are layered in here during Phases 5–6.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Run onModuleDestroy / onApplicationShutdown lifecycle hooks when the process
  // receives SIGTERM/SIGINT (container stop, EC2 restart, Ctrl+C). Lets the DB
  // pool, etc., close cleanly instead of being killed mid-request.
  app.enableShutdownHooks();

  // Port comes from validated, typed config — not raw process.env.
  // getOrThrow means a misconfiguration fails loudly rather than defaulting.
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('app.port');

  await app.listen(port);

  Logger.log(`🚀 API ready at http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
