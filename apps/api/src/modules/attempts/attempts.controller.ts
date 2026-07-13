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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttemptsService } from './attempts.service';
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

  /** Start (or resume) the student's attempt at an exam. */
  @Post()
  start(@Body() dto: StartAttemptDto) {
    return this.attempts.start(dto.examId);
  }

  /** Full attempt state (questions without answers, responses, remaining time).
   * Refresh/reconnection-safe. */
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
