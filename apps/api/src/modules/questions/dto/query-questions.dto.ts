import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { splitIds } from '../../students/dto/query-students.dto';
import { Difficulty, QuestionStatus, QuestionType } from '../question.types';

/** Upper bound on `chapterIds` — a multi-chapter filter, not a bulk id list. */
export const CHAPTER_IDS_MAX = 50;

/** `unitId` value meaning "chapters that have no unit". */
export const UNASSIGNED_UNIT = 'unassigned';

/** The unit where-fragment: a unit is derived through the question's chapter. */
export function unitIdFilter(unitId?: string): {
  chapterRef?: { unitId: string | null };
} {
  if (!unitId) return {};
  return {
    chapterRef: { unitId: unitId === UNASSIGNED_UNIT ? null : unitId },
  };
}

/**
 * The `chapterId` where-fragment for a single chapter and/or a chapter list.
 * Both together intersect, so a chapter outside the list matches nothing
 * instead of one filter silently overriding the other.
 */
export function chapterIdFilter(
  chapterId?: string,
  chapterIds?: string[],
): { chapterId?: string | { in: string[] } } {
  if (chapterId && chapterIds?.length) {
    return {
      chapterId: chapterIds.includes(chapterId) ? chapterId : { in: [] },
    };
  }
  if (chapterId) return { chapterId };
  if (chapterIds?.length) return { chapterId: { in: chapterIds } };
  return {};
}

/** Question bank filters (§2.4). */
export class QueryQuestionsDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /**
   * Questions whose chapter sits in this unit (Subject → Unit → Chapter), or
   * the literal `unassigned` for chapters that have no unit.
   */
  @IsOptional()
  @ValidateIf((o: { unitId?: string }) => o.unitId !== UNASSIGNED_UNIT)
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  /**
   * Any of these chapters. Comma-separated (`chapterIds=a,b`) or repeated
   * (`chapterIds=a&chapterIds=b`). AND-ed with the other filters, including
   * `chapterId`.
   */
  @IsOptional()
  @Transform(({ value }) => splitIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHAPTER_IDS_MAX)
  @IsUUID('all', { each: true })
  chapterIds?: string[];

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsUUID()
  examCategoryId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  /**
   * Only the questions one upload created, listed in the order of the source
   * file (the post-upload review screen).
   */
  @IsOptional()
  @IsUUID()
  importRunId?: string;

  /**
   * Only questions the caller wrote. Backs the teacher console, where "what
   * have I contributed" is a different question from "what is in the bank".
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  /** Free-text query, served by the PostgreSQL full-text search port (§2.6). */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Page size. The bank is specified to hold 20,000+ questions per institute
   * (§2.4), so listing is ALWAYS paginated — an uncapped findMany would return
   * the entire bank in one response.
   */
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
