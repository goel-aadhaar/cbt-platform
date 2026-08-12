import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { Role, UserStatus } from '../../../generated/prisma/enums';

/** Filters for the staff roster (`GET /staff`). */
export class QueryStaffDto {
  /** Which staff role to list. Defaults to TEACHER (the Teachers roster). */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  /** Restrict to a lifecycle state — PENDING covers un-accepted invitations. */
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** Case-insensitive match against name or email. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
