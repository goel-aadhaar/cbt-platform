import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

/** Upper bound on `ids`, matching the roster's page cap. */
export const STUDENT_IDS_MAX = 200;

/**
 * `ids` arrives as `a,b,c`, as a repeated parameter (an array), or as a mix of
 * both. Anything that is not a string is passed through for the validators
 * to reject.
 */
export function splitIds(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  const parts = Array.isArray(value) ? value : [value];
  if (!parts.every((p) => typeof p === 'string')) return value;
  const ids = parts
    .flatMap((p) => p.split(','))
    .map((p) => p.trim())
    .filter(Boolean);
  return [...new Set(ids)];
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

  /** Free text matched against name, email and registration number. */
  @ApiPropertyOptional({
    description:
      'Free text matched against name, email and registration number.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /**
   * Restrict the roster to these students. AND-ed with every other filter and
   * the institute scope, so an id outside either simply does not come back.
   */
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: STUDENT_IDS_MAX,
    description:
      'Only these students. Comma-separated UUIDs (`ids=a,b`) or a repeated ' +
      `parameter (\`ids=a&ids=b\`); at most ${STUDENT_IDS_MAX}. Combined with ` +
      'the other filters; ids that are not students in your institute are ' +
      'left out of the result rather than reported.',
  })
  @IsOptional()
  @Transform(({ value }) => splitIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STUDENT_IDS_MAX)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    enum: StudentSort,
    default: StudentSort.ROLL_ASC,
    description:
      'roll_asc / roll_desc order by registration number; name_* by name; ' +
      'newest / oldest by date of joining.',
  })
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
