import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Root module (≈ Spring's @Configuration + component scan root).
 *
 * As we build phases, feature modules from `src/modules/*` (Institute, Auth,
 * Exam, Question Bank, Results…) and infrastructure modules (ConfigModule,
 * DatabaseModule) get registered in `imports` here.
 */
@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
