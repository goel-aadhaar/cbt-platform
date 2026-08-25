import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttemptsService } from './attempts.service';
import { DenyAttemptDto } from './dto/attempt.dto';

/**
 * Admin side of exam entry approval (§ exam entry approval) — separate from
 * AttemptsController (STUDENT-only, scoped to the caller's own attempt)
 * because these routes act on ANY student's attempt within the admin's
 * institute. Same split as ExamsController/MonitoringController sharing the
 * `exams` path; here both controllers share `attempts`. Routes are nested
 * under `:id/...` (never a bare literal at the same depth as
 * AttemptsController's `GET :id`) so registration order between the two
 * controllers can never cause one to shadow the other.
 */
@ApiTags('attempts')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'attempts', version: '1' })
export class AdminAttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  /** Let a waiting student in. They still must click Start Exam themselves. */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.approve(id);
  }

  /** Decline a student's entry request, with an optional reason shown to them. */
  @Post(':id/deny')
  @HttpCode(HttpStatus.OK)
  deny(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DenyAttemptDto) {
    return this.attempts.deny(id, dto.reason);
  }
}
