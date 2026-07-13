import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { AuditOutcome } from '../../../generated/prisma/enums';

/** Filters for the audit-trail query (§2.13). */
export class QueryAuditDto {
  @ApiPropertyOptional({ description: 'Substring match on the action' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: AuditOutcome })
  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;

  @ApiPropertyOptional({
    description: 'Superadmin only: scope to an institute',
  })
  @IsOptional()
  @IsUUID()
  instituteId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
