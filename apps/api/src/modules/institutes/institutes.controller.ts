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
import { InstituteUsageService } from './institute-usage.service';
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
  constructor(
    private readonly institutes: InstitutesService,
    private readonly instituteUsage: InstituteUsageService,
  ) {}

  @Post()
  create(@Body() dto: CreateInstituteDto) {
    return this.institutes.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'suspended'] })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['created', 'name', 'students', 'exams', 'attempts'],
  })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  findAll(
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    // Unrecognised values fall back to the default rather than 400ing: these
    // come from a console dropdown, and a stale bookmark should still load.
    const sorts = ['created', 'name', 'students', 'exams', 'attempts'] as const;
    type Sort = (typeof sorts)[number];
    return this.institutes.findAll({
      search: search?.trim() || undefined,
      includeInactive: includeInactive === 'false' ? false : true,
      status:
        status === 'active' || status === 'suspended' ? status : undefined,
      sort: sorts.includes(sort as Sort) ? (sort as Sort) : undefined,
      order: order === 'asc' ? 'asc' : 'desc',
    });
  }

  /**
   * What this tenant consumes — storage included, which the list cannot show.
   * Its own route rather than more columns on the list: it is several extra
   * aggregates per tenant, and nobody needs them for all of them at once.
   */
  @Get(':id/usage')
  usage(@Param('id', ParseUUIDPipe) id: string) {
    return this.instituteUsage.forInstitute(id);
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
