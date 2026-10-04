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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExportStudentsDto } from './dto/export-students.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { ReassignStudentsDto } from './dto/reassign-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

const EXPORT_DESCRIPTION =
  'Roster columns registrationNumber, name, email, status, batch, joinedAt. ' +
  'With includeResults=true, each CBT result adds a row with exam, examDate, ' +
  'score, maxScore, percentage, rank, batchRank, correct, incorrect, ' +
  'unattempted, percentile and published (held results included); a student ' +
  'without results gets one row with those columns blank. Filters as for ' +
  'GET /students; with ids, only those students among them.';

const EXPORT_HEADERS_DOC = {
  'X-Export-Students': {
    description: 'Number of students in the file.',
    schema: { type: 'integer' },
  },
  'X-Export-Result-Rows': {
    description: 'Number of result rows (0 without includeResults).',
    schema: { type: 'integer' },
  },
} as const;

@ApiTags('students')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Roles(Role.ADMIN, Role.TEACHER)
  @Get()
  findAll(@Query() query: QueryStudentsDto) {
    return this.students.findAll(query);
  }

  /**
   * Student List export as CSV. GET takes the filters as query parameters;
   * POST takes the same fields as a JSON body, for a selection of ids too
   * long to fit in a URL. Both declared before `:id`.
   */
  @Get('export')
  @ApiOperation({
    summary: 'Export students (optionally with their CBT results) as CSV',
    description: EXPORT_DESCRIPTION,
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, headers: EXPORT_HEADERS_DOC })
  exportCsv(
    @Query() query: ExportStudentsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendExport(query, res);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export students (optionally with their CBT results) as CSV',
    description: `${EXPORT_DESCRIPTION} Same fields as the GET, as a JSON body.`,
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, headers: EXPORT_HEADERS_DOC })
  exportCsvPost(
    @Body() body: ExportStudentsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendExport(body, res);
  }

  private async sendExport(
    query: ExportStudentsDto,
    res: Response,
  ): Promise<StreamableFile> {
    const out = await this.students.exportRoster(query);
    res.setHeader('X-Export-Students', String(out.students));
    res.setHeader('X-Export-Result-Rows', String(out.resultRows));
    return new StreamableFile(Buffer.from(out.csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${out.filename}"`,
    });
  }

  /**
   * Bulk-import a batch's students from an Excel workbook or CSV (§2.10).
   * Field `file`; columns `name`, `email` (required). Roll numbers are always
   * server-generated, never read from the file.
   */
  /** The blank workbook to fill in, with the columns the parser expects. */
  @Get('import/template')
  async importTemplate(): Promise<StreamableFile> {
    const buffer = await this.students.importTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="codonmind-students-template.xlsx"',
    });
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'batchId', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    // A workbook carries styling and shared strings, so the same roster is
    // several times larger as .xlsx than as .csv — 2 MB rejected files that
    // were well inside the 1000-row limit.
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importRoster(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'A file is required (form field "file") — .xlsx or .csv',
      );
    }
    return this.students.importRoster({
      batchId,
      buffer: file.buffer,
      invitedById: user.userId,
      fileName: file.originalname,
    });
  }

  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.findOne(id);
  }

  /**
   * Bulk-reassign students to a different batch. Declared before `:id`
   * routes because Nest matches routes in declaration order — the same
   * trick `/students/import` and `/staff/me/batches` rely on ahead of the
   * dynamic-id routes.
   */
  @Post('reassign-batch')
  @HttpCode(HttpStatus.OK)
  reassignBatch(@Body() dto: ReassignStudentsDto) {
    return this.students.reassignBatch(dto.studentIds, dto.targetBatchId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.reactivate(id);
  }

  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  resendInvite(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.resendInvite(id);
  }
}
