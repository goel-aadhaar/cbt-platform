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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

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
