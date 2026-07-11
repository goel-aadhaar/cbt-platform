import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@ApiBearerAuth()
@Roles(Role.TEACHER, Role.ADMIN)
@Controller({ path: 'questions', version: '1' })
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post()
  create(@Body() dto: CreateQuestionDto) {
    return this.questions.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryQuestionsDto) {
    return this.questions.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.update(id, dto);
  }

  /** Author submits a draft for admin review. */
  @Post(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.submit(id);
  }

  // --- Admin-only lifecycle transitions (override the class-level roles) ---

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.approve(id);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  reject(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.reject(id);
  }

  @Post(':id/archive')
  @Roles(Role.ADMIN)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.archive(id);
  }
}
