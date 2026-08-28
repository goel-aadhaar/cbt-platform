import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
