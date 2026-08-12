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
import { CreateInstituteDto } from './dto/create-institute.dto';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { InstitutesService } from './institutes.service';

/**
 * Tenant administration. Superadmin only — these are the one set of routes in
 * the platform that deliberately read across institutes.
 */
@ApiTags('institutes')
@ApiBearerAuth()
@Roles(Role.SUPERADMIN)
@Controller({ path: 'institutes', version: '1' })
export class InstitutesController {
  constructor(private readonly institutes: InstitutesService) {}

  @Post()
  create(@Body() dto: CreateInstituteDto) {
    return this.institutes.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.institutes.findAll({
      search: search?.trim() || undefined,
      includeInactive: includeInactive === 'false' ? false : true,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.institutes.findOne(id);
  }

  /** Rename, suspend or restore a tenant. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstituteDto,
  ) {
    return this.institutes.update(id, dto);
  }

  /**
   * Delete a tenant. Refused while it holds records unless force=true — see
   * the service for why suspension is the safer default.
   */
  @Delete(':id')
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force') force?: string,
  ) {
    return this.institutes.remove(id, force === 'true');
  }
}
