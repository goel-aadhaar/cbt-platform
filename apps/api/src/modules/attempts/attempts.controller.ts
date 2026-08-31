import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttemptsService } from './attempts.service';
import { ListAvailableDto } from './dto/attempt.dto';
import {
  RecordSectionTimeDto,
  ReportViolationDto,
  SaveResponseDto,
  StartAttemptDto,
} from './dto/attempt.dto';

@ApiTags('attempts')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller({ path: 'attempts', version: '1' })
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  /**
   * Request entry into an exam (§ exam entry approval). Creates the attempt
   * PENDING an admin's decision — no clock runs yet. Idempotent: calling
   * this again just reads back the request's current status (and reopens it
   * for review if it was denied).
   */
  @Post()
  requestEntry(@Body() dto: StartAttemptDto) {
    return this.attempts.requestEntry(dto.examId);
  }

  /**
   * List exams the current student can sit right now. Backs the student
   * portal's "Start" CTAs without leaking /exams (TEACHER/ADMIN-only).
   */
  @Get('available')
  available(@Query() query: ListAvailableDto) {
    return this.attempts.availableForStudent(query.kind);
  }

  /** Poll target for the entry-approval waiting screen. */
  @Get(':id/entry')
  getEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.getEntry(id);
  }

  /**
   * The server-controlled timer starts here (§ exam entry approval) — only
   * once the attempt is APPROVED. Creates the blank per-question responses
   * and returns the same full state shape as `GET :id`.
   */
  @Post(':id/begin')
  @HttpCode(HttpStatus.OK)
  begin(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.begin(id);
  }

  /** Full attempt state (questions without answers, responses, remaining time).
   * Refresh/reconnection-safe. Only valid once the attempt has begun. */
  @Get(':id')
  getState(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.getState(id);
  }

  @Put(':id/responses/:questionId')
  @HttpCode(HttpStatus.OK)
  saveResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SaveResponseDto,
  ) {
    return this.attempts.saveResponse(id, questionId, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.submit(id);
  }

  /**
   * Leave without submitting. Discards the candidate's responses — only a
   * submitted attempt is stored — but still spends the attempt, so the exam
   * cannot be entered again.
   */
  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  abandon(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.abandon(id);
  }

  /** Accumulate time spent in a section (§2.8). Send elapsed deltas. */
  @Put(':id/section-time')
  @HttpCode(HttpStatus.OK)
  recordSectionTime(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordSectionTimeDto,
  ) {
    return this.attempts.recordSectionTime(id, dto);
  }

  /** Report a proctoring violation (tab switch, full-screen exit, …). */
  @Post(':id/violations')
  @HttpCode(HttpStatus.OK)
  reportViolation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportViolationDto,
  ) {
    return this.attempts.reportViolation(id, dto);
  }

  @Get(':id/summary')
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.summary(id);
  }
}
