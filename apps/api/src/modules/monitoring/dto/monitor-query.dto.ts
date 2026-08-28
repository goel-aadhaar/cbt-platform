import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const MONITOR_STATES = [
  'NOT_STARTED',
  // Entry-approval states (§ exam entry approval) — waiting on, or decided
  // by, an admin; none of these have a running clock.
  'PENDING_APPROVAL',
  'APPROVED',
  'DENIED',
  'IN_PROGRESS',
  'SUBMITTED',
  'AUTO_SUBMITTED',
] as const;

/** Filters for the live exam monitor (§2.12). */
export class MonitorQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to a single assigned batch' })
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @ApiPropertyOptional({ enum: MONITOR_STATES })
  @IsOptional()
  @IsIn(MONITOR_STATES)
  status?: (typeof MONITOR_STATES)[number];

  /**
   * Pages the `students` roster (§ pagination) — a single exam sitting can
   * assign several hundred candidates. Left unset, every candidate is
   * returned (the CSV attendance export relies on exactly this, via
   * `getExamMonitor(examId, {})`); `counts`/`totalStudents` are always
   * computed over the WHOLE roster regardless, never just the returned page.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
