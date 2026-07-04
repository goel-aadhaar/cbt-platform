import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { validateEnv } from './config/env.schema';

/**
 * Root module (≈ Spring's @Configuration + component-scan root).
 *
 * ConfigModule is registered `isGlobal`, so ConfigService and any registered
 * config namespace (e.g. appConfig) are injectable anywhere without re-importing.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ConfigService available app-wide, no re-import needed
      cache: true, // cache process.env reads for speed
      expandVariables: true, // allow ${VAR} interpolation inside .env
      load: [appConfig], // typed, namespaced config
      validate: validateEnv, // fail-fast schema validation at bootstrap
      envFilePath: ['.env'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
