import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateExamCategoryDto,
  UpdateExamCategoryDto,
} from './dto/exam-category.dto';
import { ExamCategoriesService } from './exam-categories.service';

/**
 * Exam catalogue (§2.3). Administrators curate it; teachers read it while
 * authoring, so the list is open to both and every mutation is admin-only.
 */
@ApiTags('exam-categories')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'exam-categories', version: '1' })
export class ExamCategoriesController {
  constructor(private readonly categories: ExamCategoriesService) {}

  @Get()
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.categories.findAll(activeOnly !== 'true');
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateExamCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}
