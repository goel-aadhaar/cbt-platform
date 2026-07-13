import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.SUPERADMIN, Role.ADMIN)
@Controller({ path: 'audit-logs', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Browse the audit trail. Admins see their institute; superadmins see all. */
  @Get()
  findAll(@Query() query: QueryAuditDto) {
    return this.audit.findMany(query);
  }
}
