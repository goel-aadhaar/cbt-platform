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
import {
  CheckAnswerDto,
  CompleteSessionDto,
  StartSessionDto,
} from './dto/practice.dto';
import { PracticeService } from './practice.service';

/**
 * Student DPP attempts (§ Product Structure). No attempt row, no timer, no
 * proctoring — a session over one named, teacher-curated paper. Answer keys
 * are never listed; each answer is graded and revealed one at a time as the
 * student commits it.
 */
@ApiTags('practice')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller({ path: 'practice', version: '1' })
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  /** Open (or resume) a session and receive its question set. */
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
