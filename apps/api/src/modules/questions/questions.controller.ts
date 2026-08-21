import {
  BadRequestException,
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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { ArchiveQuestionDto } from './dto/archive-question.dto';
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

  /**
   * Bulk-import questions from a `.docx` or `.xlsx` upload (§2.4). Field `file`.
   *
   * **Word**: each question starts with `Q:`/`1.`, options `A) …`, `Answer: …`,
   * plus optional `Key: value` lines. Images in the document are imported and
   * attached to the question they appear in.
   *
   * **Excel**: one question per row — `statement` and `answer` are required,
   * `optionA`…`optionH` hold the choices, and `type`/`difficulty`/`marks`/
   * `negativeMarks`/`explanation`/`tags` are optional columns.
   *
   * `subjectId`/`chapterId` apply to every question in the file (selected once
   * via the import dialog's cascading dropdowns); `examCategoryId` is optional;
   * `difficulty`/`type` are per-row defaults for rows that omit them.
   */
  /** The blank workbook to fill in, with the columns the parser expects. */
  @Get('import/template')
  async importTemplate(): Promise<StreamableFile> {
    const buffer = await this.questions.importTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="drsk-questions-template.xlsx"',
    });
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'subjectId', required: true })
  @ApiQuery({ name: 'chapterId', required: true })
  @ApiQuery({ name: 'difficulty', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'examCategoryId', required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    // 10 MB: a workbook of a few hundred questions, or a Word paper carrying
    // its diagrams, both comfortably exceed the old 5 MB ceiling.
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importQuestions(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('subjectId', new ParseUUIDPipe({ optional: true }))
    subjectId?: string,
    @Query('chapterId', new ParseUUIDPipe({ optional: true }))
    chapterId?: string,
    @Query('difficulty') difficulty?: string,
    @Query('type') type?: string,
    @Query('examCategoryId', new ParseUUIDPipe({ optional: true }))
    examCategoryId?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'A file is required (field "file") — .docx or .xlsx',
      );
    }
    return this.questions.importQuestions(
      file.buffer,
      { subjectId, chapterId, difficulty, type, examCategoryId },
      file.originalname,
    );
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

  /**
   * Practice-library curation (§2.4) — TEACHER or ADMIN, no approval step.
   * Adding here does not remove the question from exam use.
   */
  @Post(':id/practice')
  @HttpCode(HttpStatus.OK)
  addToPractice(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.addToPracticeLibrary(id);
  }

  @Delete(':id/practice')
  @HttpCode(HttpStatus.OK)
  removeFromPractice(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.removeFromPracticeLibrary(id);
  }

  @Post(':id/archive')
  @Roles(Role.ADMIN)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveQuestionDto,
  ) {
    return this.questions.archive(id, dto.confirm);
  }
}
