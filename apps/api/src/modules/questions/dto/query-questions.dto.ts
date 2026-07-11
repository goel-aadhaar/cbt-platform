import { IsEnum, IsOptional, IsString } from 'class-validator';

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

  /** Case-insensitive substring match on the statement (simple search; the
   * PostgreSQL full-text adapter from §2.6 is a later addition). */
  @IsOptional()
  @IsString()
  search?: string;
}
