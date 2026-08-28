import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueryImportsDto } from './dto/query-imports.dto';
import { ImportsService } from './imports.service';

/** Import history (§2.10) — what was loaded, by whom, and what failed. */
@ApiTags('imports')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'imports', version: '1' })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(@Query() query: QueryImportsDto) {
    return this.imports.list(query);
  }
}
