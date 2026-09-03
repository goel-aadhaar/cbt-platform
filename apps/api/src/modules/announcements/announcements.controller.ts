import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';

/** Authoring side — staff only. Drafts live here until published. */
@ApiTags('announcements')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@Query() query: QueryAnnouncementsDto) {
    return this.announcements.listForStaff(query);
  }

  @Post()
  create(@Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcements.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.publish(id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.unpublish(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.remove(id);
  }
}

/**
 * Reading side — the caller's own feed, student or teacher. Separate
 * controller so a recipient role never touches the authoring routes.
 *
 * One set of routes rather than a teacher copy: the audience is decided from
 * the session, so a caller cannot ask for someone else's feed, and the bell
 * component is identical on both portals.
 */
@ApiTags('announcements')
@ApiBearerAuth()
@Roles(Role.STUDENT, Role.TEACHER)
@Controller({ path: 'me/announcements', version: '1' })
export class MyAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list() {
    return this.announcements.listForMe();
  }

  /**
   * How many notices have arrived since the caller last looked — the number
   * on the bell. Declared before nothing dynamic, so no route-order concern.
   */
  @Get('unread-count')
  unreadCount() {
    return this.announcements.unreadCountForMe();
  }

  /**
   * Clear the badge. Called when the recipient opens their announcements, which
   * is the moment "seen" actually becomes true.
   */
  @Post('seen')
  @HttpCode(HttpStatus.OK)
  markSeen() {
    return this.announcements.markSeenForMe();
  }
}
