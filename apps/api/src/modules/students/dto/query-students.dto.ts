import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { UserStatus } from '../../../generated/prisma/enums';

/** Column the roster may be ordered by. Constrained so the value can be fed
 * straight into Prisma's orderBy without opening an injection surface. */
export enum StudentSort {
  ROLL_ASC = 'roll_asc',
  ROLL_DESC = 'roll_desc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

/** Roster filters (§2.10). Listing is always paginated — see StudentsService. */
export class QueryStudentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  batchId?: string;

  /** Narrow to one class; combines with the caller's teacher scope. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;

  /** Narrow to one program; combines with the caller's teacher scope. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  programId?: string;

  /** Account status — drives the All / Deactivated / Pending roster tabs. */
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** Free text matched against name, email and roll number. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: StudentSort, default: StudentSort.ROLL_ASC })
  @IsOptional()
  @IsEnum(StudentSort)
  sort?: StudentSort;

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
