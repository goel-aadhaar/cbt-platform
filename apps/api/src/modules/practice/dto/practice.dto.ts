import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { Difficulty, QuestionType } from '../../questions/question.types';

/** Filters a student can use to pull practice questions (§2.4). */
export class QueryPracticeDto {
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
  @IsString()
  tag?: string;

  /** Practice sets are short by design; capped so a student can't pull the bank. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * A single answer to grade. The client never receives `answerKey`, so checking
 * has to round-trip — that is deliberate: practice questions may also appear in
 * live exams, and shipping keys to the browser would leak those answers.
 */
export class CheckAnswerDto {
  @IsUUID()
  questionId!: string;

  /** string (MCQ key), string[] (MSQ keys) or number (INTEGER). */
  @IsDefined()
  answer!: string | number | string[];
}
