import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A Daily Practice Paper (§ Product Structure): a named, curated set of
 * questions assembled directly from the Question Bank — filter, tick, name
 * it — and shared with batches, mirroring how a resource or exam is shared.
 */
export class CreateDppDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** For the student shelf's grouping — optional, a DPP may mix subjects. */
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  /**
   * The exact paper, in the order it should be attempted. At least one — a
   * DPP with no questions is not a draft, it is nothing to practise.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds!: string[];

  /**
   * Batches to share with. At least one, same reasoning as Resources: a DPP
   * nobody can reach is not a draft, it went nowhere. Checked server-side
   * against the teacher's own batches — the dropdown is not the control.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  batchIds!: string[];
}

export class UpdateDppDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  /** Omitted leaves the question set untouched; a list replaces it outright. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds?: string[];

  /** Omitted leaves sharing untouched; a list replaces it outright. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  batchIds?: string[];
}

export class QueryDppDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @Type(() => Boolean)
  mine?: boolean;
}
