import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { MonitorQueryDto } from './dto/monitor-query.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'exams', version: '1' })
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  /** Live progress snapshot of an exam's candidates (§2.12). Poll on interval. */
  @Get(':id/monitor')
  monitor(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MonitorQueryDto,
  ) {
    return this.monitoring.getExamMonitor(id, query);
  }
}
