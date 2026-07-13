import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  AddQuestionDto,
  AssignBatchDto,
  CloneExamDto,
  CreateSectionDto,
  ScheduleExamDto,
} from './dto/exam-parts.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamsService } from './exams.service';

@ApiTags('exams')
@ApiBearerAuth()
@Roles(Role.TEACHER, Role.ADMIN)
@Controller({ path: 'exams', version: '1' })
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Post()
  create(@Body() dto: CreateExamDto) {
    return this.exams.create(dto);
  }

  @Get()
  findAll() {
    return this.exams.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto) {
    return this.exams.update(id, dto);
  }

  /** Clone an exam into a fresh draft (§2.3). */
  @Post(':id/clone')
  clone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloneExamDto) {
    return this.exams.clone(id, dto.title);
  }

  @Post(':id/sections')
  addSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.exams.addSection(id, dto);
  }

  @Post(':id/sections/:sectionId/questions')
  addQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: AddQuestionDto,
  ) {
    return this.exams.addQuestion(id, sectionId, dto);
  }

  // --- Admin-only: finalize + publish ---

  @Post(':id/batches')
  @Roles(Role.ADMIN)
  assignBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignBatchDto,
  ) {
    return this.exams.assignBatch(id, dto);
  }

  @Patch(':id/schedule')
  @Roles(Role.ADMIN)
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleExamDto,
  ) {
    return this.exams.schedule(id, dto);
  }

  @Post(':id/publish')
  @Roles(Role.ADMIN)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.publish(id);
  }

  @Post(':id/unpublish')
  @Roles(Role.ADMIN)
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.unpublish(id);
  }
}
