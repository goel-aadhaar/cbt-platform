import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { InstitutesService } from './institutes.service';

@ApiTags('institutes')
@ApiBearerAuth()
@Controller({ path: 'institutes', version: '1' })
export class InstitutesController {
  constructor(private readonly institutes: InstitutesService) {}

  /** Superadmin creates a new institute (tenant). */
  @Post()
  @Roles(Role.SUPERADMIN)
  create(@Body() dto: CreateInstituteDto) {
    return this.institutes.create(dto);
  }
}
