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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  AddQuestionDto,
  AssignBatchDto,
  CreateSectionDto,
  RejectExamDto,
  ReorderQuestionsDto,
  ReorderSectionsDto,
  ScheduleExamDto,
  UpdateSectionDto,
  SubmitExamDto,
} from './dto/exam-parts.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamsService } from './exams.service';

@ApiTags('exams')
@ApiBearerAuth()
@Roles(Role.TEACHER, Role.ADMIN)
@Controller({ path: 'exams', version: '1' })
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  /**
   * Authoring is the teacher's job (§2.3): a teacher builds the paper and an
   * administrator approves, schedules and publishes it. Keeping creation out of
   * the admin's hands is what makes the approval step meaningful — an approver
   * who wrote the paper is not reviewing it.
   */
  @Post()
  @Roles(Role.TEACHER)
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

  /** Drag-and-drop reordering (§ exam authoring) — DRAFT exams only. */
  @Patch(':id/sections/reorder')
  reorderSections(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderSectionsDto,
  ) {
    return this.exams.reorderSections(id, dto);
  }

  @Patch(':id/sections/:sectionId/questions/reorder')
  reorderQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.exams.reorderQuestions(id, sectionId, dto);
  }

  /**
   * Amend a section. Marks live here, not on the question, so this is the only
   * way to correct a paper's scoring before it is sat.
   *
   * Declared AFTER the literal `sections/reorder` routes above. Express
   * matches in declaration order, so a `:sectionId` route placed first would
   * swallow "reorder" as an id — and ParseUUIDPipe would then 400 every
   * drag-and-drop reorder instead of performing it.
   */
  @Patch(':id/sections/:sectionId')
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.exams.updateSection(id, sectionId, dto);
  }

  /** Drop a section and its placements. The questions return to the bank. */
  @Delete(':id/sections/:sectionId')
  removeSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return this.exams.removeSection(id, sectionId);
  }

  /** Take one question off the paper. The question itself is untouched. */
  @Delete(':id/sections/:sectionId/questions/:questionId')
  removeQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.exams.removeQuestion(id, sectionId, questionId);
  }

  /**
   * Approval workflow (§2.3). The author (teacher or admin) submits a finished
   * draft to a named admin; an admin then approves it into the qualified pool,
   * rejects it back to the author, or starts it immediately.
   */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submitForReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitExamDto,
  ) {
    return this.exams.submitForReview(id, dto.reviewerId);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.approve(id);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectExamDto) {
    return this.exams.reject(id, dto.reason);
  }

  /** Open the window now and make an approved exam live. */
  @Post(':id/start')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  startNow(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.startNow(id);
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

  /** Drop a batch assignment — used when rescheduling changes who sits it. */
  @Delete(':id/batches/:batchId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  unassignBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.exams.unassignBatch(id, batchId);
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
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.publish(id);
  }

  @Post(':id/unpublish')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.unpublish(id);
  }
}
