import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { Difficulty, QuestionType } from '../question.types';

export class QuestionOptionDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsString()
  mediaKey?: string;
}

export class CreateQuestionDto {
  @IsUUID()
  subjectId: string;

  @IsUUID()
  chapterId: string;

  /** Nullable so an update can explicitly clear it (§ taxonomy). */
  @IsOptional()
  @IsUUID()
  topicId?: string | null;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsOptional()
  @IsString()
  language?: string;

  /**
   * The Exam Categories catalogue entry this question is suited for (§2.3) —
   * optional, since a question can exist with no exam type assigned yet.
   * Nullable so an update can explicitly clear it.
   */
  @IsOptional()
  @IsUUID()
  examCategoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @MinLength(1)
  statement: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  /** MCQ: option key ("A"); MSQ: keys (["A","C"]); INTEGER: a number. */
  @IsDefined()
  answerKey: string | number | string[];

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsNumber()
  marks?: number;

  @IsOptional()
  @IsNumber()
  negativeMarks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaKeys?: string[];

  /**
   * ADMIN only, and true by default for them: an administrator's question goes
   * straight into the bank rather than into a queue only they can clear.
   * Send `false` to keep it as a draft instead. Ignored for a teacher, whose
   * questions are always drafts until an admin approves them.
   */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
