import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckAnswerDto, QueryPracticeDto } from './dto/practice.dto';
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
}
