import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { QueryStudentsDto, splitIds } from './query-students.dto';

/** Most students one selective export may name. */
export const EXPORT_IDS_MAX = 1000;

/**
 * Read from the raw source: with implicit conversion on, the converted value
 * of the string "false" is already `true` by the time a transform sees it.
 */
function toBoolean(raw: unknown): unknown {
  if (raw === true || raw === 'true' || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === '0') return false;
  return raw;
}

/**
 * Student export (Student List → Export Selected / Export All). The same
 * filters as the roster, without paging: either everything they match, or
 * only the listed `ids` among it.
 */
export class ExportStudentsDto extends OmitType(QueryStudentsDto, [
  'ids',
  'limit',
  'offset',
] as const) {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: EXPORT_IDS_MAX,
    description:
      'Only these students (Export Selected). Comma-separated UUIDs or an ' +
      `array; at most ${EXPORT_IDS_MAX}. Combined with the other filters; ids ` +
      'that are not students in your institute, or that the filters exclude, ' +
      'are left out (compare X-Export-Students with the number sent). A long ' +
      'list will not fit in a URL: send it as the JSON body of POST ' +
      '/students/export.',
  })
  @IsOptional()
  @Transform(({ value }) => splitIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EXPORT_IDS_MAX)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Add each student’s CBT results: one row per student per result, and ' +
      'one row with blank result columns for a student without any. Held ' +
      '(unpublished) results are included and marked in the `published` column.',
  })
  @IsOptional()
  @Transform(({ obj, key }) => toBoolean((obj as Record<string, unknown>)[key]))
  @IsBoolean()
  includeResults?: boolean;
}
