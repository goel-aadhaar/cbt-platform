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
  CreateInstructionTemplateDto,
  UpdateInstructionTemplateDto,
} from './dto/instruction-template.dto';
import { InstructionTemplatesService } from './instruction-templates.service';

/**
 * Instruction template catalogue (§ exam authoring). Administrators curate
 * it; teachers read it while authoring, so the list is open to both and
 * every mutation is admin-only — same shape as exam-categories.
 */
@ApiTags('instruction-templates')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'instruction-templates', version: '1' })
export class InstructionTemplatesController {
  constructor(private readonly templates: InstructionTemplatesService) {}

  @Get()
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.templates.findAll(activeOnly !== 'true');
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateInstructionTemplateDto) {
    return this.templates.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstructionTemplateDto,
  ) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(id);
  }
}
