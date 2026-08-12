import { Type } from 'class-transformer';
import {
  IsBoolean,
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

/** Opens a practice session over one scope (§2.4). */
export class StartSessionDto {
  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  chapter?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  /** Set size. Capped server-side; practice sets are short by design. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  size?: number;

  /** The student's optional self-imposed timer. */
  @IsOptional()
  @IsBoolean()
  timed?: boolean;
}

export class CompleteSessionDto {
  /** Wall-clock seconds the student spent, reported by the client. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}
