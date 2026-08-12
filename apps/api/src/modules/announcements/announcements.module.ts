import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import {
  AnnouncementsController,
  MyAnnouncementsController,
} from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [AnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
