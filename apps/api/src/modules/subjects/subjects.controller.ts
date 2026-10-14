import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';

/**
 * Readable by TEACHER too (unlike Programs/Classes/Batches) — a teacher picks
 * a subject when authoring a question, same read-open pattern as
 * ExamCategoriesController.
 */
@ApiTags('subjects')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'subjects', version: '1' })
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateSubjectDto) {
    return this.subjects.create(dto);
  }

  @Get()
  findAll(
    @Query('withCounts') withCounts?: string,
    @Query('classId', new ParseUUIDPipe({ optional: true }))
    classId?: string,
    @Query('noClass', new ParseBoolPipe({ optional: true }))
    noClass?: boolean,
  ) {
    const filters = { classId, noClass };
    return withCounts === 'true'
      ? this.subjects.findAllWithCounts(filters)
      : this.subjects.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.subjects.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.subjects.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.subjects.remove(id);
  }
}
