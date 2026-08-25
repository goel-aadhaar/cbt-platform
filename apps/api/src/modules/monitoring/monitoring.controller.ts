import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AttemptsService } from '../attempts/attempts.service';
import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { MonitorQueryDto } from './dto/monitor-query.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'exams', version: '1' })
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly attempts: AttemptsService,
  ) {}

  /** Live progress snapshot of an exam's candidates (§2.12). Poll on interval. */
  @Get(':id/monitor')
  monitor(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MonitorQueryDto,
  ) {
    return this.monitoring.getExamMonitor(id, query);
  }

  /**
   * Students waiting on (or recently decided for) entry into this exam
   * (§ exam entry approval). Admin-only: a teacher can watch the monitor but
   * does not gate who gets in. Poll on interval, same as :id/monitor.
   */
  @Get(':id/entry-requests')
  @Roles(Role.ADMIN)
  entryRequests(@Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.listEntryRequests(id);
  }

  /**
   * Who was expected and who turned up (§2.14 reports).
   *
   * Distinct from the result sheet, which only contains candidates who have a
   * result — the people an institute needs to chase are exactly the ones it
   * leaves out.
   */
  @Get(':id/attendance')
  attendance(@Param('id', ParseUUIDPipe) id: string) {
    return this.monitoring.getAttendance(id);
  }

  @Get(':id/attendance/export/csv')
  async attendanceCsv(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { filename, csv } = await this.monitoring.exportAttendanceCsv(id);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
