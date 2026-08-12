import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { Difficulty, QuestionStatus, QuestionType } from '../question.types';

/** Question bank filters (§2.4). */
export class QueryQuestionsDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  chapter?: string;

  @IsOptional()
  @IsString()
  topic?: string;

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
  @IsString()
  examType?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  /** Restrict to (or exclude) questions curated into the practice library. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  inPracticeLibrary?: boolean;

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
