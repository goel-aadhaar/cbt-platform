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
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { ResourcesService } from './resources.service';

/**
 * Study material (§2.12).
 *
 * Reading is open to students as well as staff — that is the point of sharing —
 * and the service decides what each caller may see. Writing is staff only.
 */
@ApiTags('resources')
@ApiBearerAuth()
@Controller({ path: 'resources', version: '1' })
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiQuery({ name: 'subjectId', required: false })
  list(@Query('subjectId') subjectId?: string) {
    return this.resources.list(subjectId?.trim() || undefined);
  }

  /** Subjects that actually have material, with counts — the sidebar's index. */
  @Get('shelves')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  shelves() {
    return this.resources.shelves();
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

  /** Unshare. The file stays in the library — see the service for why. */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.resources.remove(id);
  }
}
