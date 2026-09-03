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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateResourceDto,
  QueryResourcesDto,
  UpdateResourceDto,
} from './dto/resource.dto';
import { ResourcesService } from './resources.service';

/**
 * Study material (§2.12).
 *
 * Reading is open to students as well as staff — that is the point of sharing —
 * and the service decides what each caller may see from their session, never
 * from a query parameter. Writing is staff only.
 *
 * The browse routes (`subjects`, `subjects/:id/chapters`) exist so the portals
 * can render Subject > Chapter > Resource without downloading the library to
 * count it. Both are declared before `:id` so neither is shadowed by it.
 */
@ApiTags('resources')
@ApiBearerAuth()
@Controller({ path: 'resources', version: '1' })
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  list(@Query() query: QueryResourcesDto) {
    return this.resources.list(query);
  }

  /** Subjects holding visible material, with chapter and resource counts. */
  @Get('subjects')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  subjects() {
    return this.resources.subjects();
  }

  /** Chapters under one subject that hold visible material, with counts. */
  @Get('subjects/:subjectId/chapters')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  chapters(@Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.resources.chapters(subjectId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.resources.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.TEACHER)
  create(@Body() dto: CreateResourceDto) {
    return this.resources.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resources.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.resources.remove(id);
  }
}
