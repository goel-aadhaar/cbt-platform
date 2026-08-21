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
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { ProgramsService } from './programs.service';

@ApiTags('programs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'programs', version: '1' })
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Post()
  create(@Body() dto: CreateProgramDto) {
    return this.programs.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(@Query('includeArchived') includeArchived?: string) {
    return this.programs.findAll(includeArchived === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.programs.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.programs.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.programs.remove(id);
  }
}
