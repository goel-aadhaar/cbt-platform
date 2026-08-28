import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Paging for GET /imports (§ pagination) — an institute's import history
 *  grows without bound over years of use; the hardcoded `take: 50` this
 *  replaces made every run before the 50 most recent permanently
 *  unreachable, with no way to page back to them. */
export class QueryImportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
