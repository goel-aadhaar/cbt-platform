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
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@ApiTags('classes')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'classes', version: '1' })
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Post()
  create(@Body() dto: CreateClassDto) {
    return this.classes.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(
    @Query('programId', new ParseUUIDPipe({ optional: true }))
    programId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.classes.findAll(programId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.classes.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) {
    return this.classes.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.classes.remove(id);
  }
}
