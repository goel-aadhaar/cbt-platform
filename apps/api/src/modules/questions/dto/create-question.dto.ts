import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
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
  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  chapter: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsOptional()
  @IsString()
  language?: string;

  @IsString()
  @MinLength(1)
  examType: string;

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
}
