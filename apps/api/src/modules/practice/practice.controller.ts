import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CheckAnswerDto,
  CompleteSessionDto,
  QueryPracticeDto,
  StartSessionDto,
} from './dto/practice.dto';
import { PracticeService } from './practice.service';

/**
 * Student practice library (§2.4). Read-only drilling over the questions a
 * teacher curated — no attempt row, no timer, no proctoring. Answer keys are
 * never listed; `POST /practice/check` grades one answer at a time.
 */
@ApiTags('practice')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller({ path: 'practice', version: '1' })
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  /** Subjects/chapters/topics available to drill, with counts. */
  @Get('facets')
  facets() {
    return this.practice.facets();
  }

  @Get('questions')
  questions(@Query() query: QueryPracticeDto) {
    return this.practice.questions(query);
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(@Body() dto: CheckAnswerDto) {
    return this.practice.check(dto);
  }

  /* --- Sessions: the progress the library reports is built from these. --- */

  /** Open a session and receive its question set. */
  @Post('sessions')
  startSession(@Body() dto: StartSessionDto) {
    return this.practice.startSession(dto);
  }

  /** Grade one answer and record it against the session. */
  @Post('sessions/:id/answer')
  @HttpCode(HttpStatus.OK)
  answerInSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckAnswerDto,
  ) {
    return this.practice.answerInSession(id, dto);
  }

  /** Close the session and return its summary. */
  @Post('sessions/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteSessionDto,
  ) {
    return this.practice.completeSession(id, dto);
  }
}
