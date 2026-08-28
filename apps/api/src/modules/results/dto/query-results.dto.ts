import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Paging for GET /exams/:id/results (§ pagination). Bounded by the exam's own
 * candidate count (itself bounded by batch size), not the institute-wide
 * scale of students/questions — `limit` defaults generously so the internal
 * callers that need the WHOLE ranked set (participants enrichment, the
 * results-count preview) keep working unchanged.
 */
export class QueryResultsDto {
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
