import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@ApiTags('students')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  findAll(
    @Query('batchId', new ParseUUIDPipe({ optional: true })) batchId?: string,
  ) {
    return this.students.findAll(batchId);
  }

  /**
   * Bulk-import a batch's students from a CSV upload (§2.10). Field `file`;
   * columns `name`, `email` (required) and optional `rollNumber`.
   */
  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'batchId', required: true })
  @ApiQuery({ name: 'rollPrefix', required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  importCsv(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() user: AuthUser,
    @Query('rollPrefix') rollPrefix?: string,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required (form field "file")');
    }
    return this.students.importCsv({
      batchId,
      buffer: file.buffer,
      rollPrefix,
      invitedById: user.userId,
    });
  }

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
}
