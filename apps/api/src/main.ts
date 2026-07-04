import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Application entry point (like Spring Boot's main()).
 *
 * Cross-cutting production concerns — global validation pipe, security headers
 * (Helmet), CORS, rate limiting, structured logging, Swagger, API versioning —
 * are layered in here during Phases 5–6. For now this is a clean, correct
 * baseline: create the app, enable graceful shutdown, and listen.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Run onModuleDestroy / onApplicationShutdown lifecycle hooks when the process
  // receives SIGTERM/SIGINT (container stop, EC2 restart, Ctrl+C). This lets
  // things like the DB connection pool close cleanly instead of being killed
  // mid-request. Essential for zero-downtime deploys.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`🚀 API ready at http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
