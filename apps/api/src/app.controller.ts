import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import type { AppStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Liveness ping — confirms the process is up and serving HTTP.
   * Readiness / dependency health (DB, S3) via @nestjs/terminus arrives in Phase 6.
   */
  @Get()
  getStatus(): AppStatus {
    return this.appService.getStatus();
  }
}
