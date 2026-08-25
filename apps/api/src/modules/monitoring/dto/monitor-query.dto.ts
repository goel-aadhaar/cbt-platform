import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

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
}
