import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ExamKind } from '../exam.types';

/**
 * Paging for GET /exams (§ pagination). Unlike the question bank (specified
 * for 20,000+ rows) an institute's exam catalogue realistically stays in the
 * dozens-to-low-hundreds even after years of operation, so `limit` defaults
 * generously rather than forcing every internal caller (monitoring, results,
 * report dropdowns — all of which need the WHOLE set to compute correctly)
 * to opt in explicitly. The two screens that actually browse this as a
 * growing table (admin/exams, teacher/exams) pass a real page size.
 */
export class QueryExamsDto {
  /**
   * Defaults to MOCK_TEST in the service (see ExamsService.findAll) when
   * omitted — every pre-existing caller of GET /exams doesn't send this and
   * must keep seeing exactly what it saw before Assessments existed. Pass
   * ASSESSMENT explicitly to list assessments instead.
   */
  @IsOptional()
  @IsEnum(ExamKind)
  kind?: ExamKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
