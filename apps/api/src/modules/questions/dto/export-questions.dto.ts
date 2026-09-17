import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { Difficulty, QuestionStatus, QuestionType } from '../question.types';

export enum ExportFormat {
  PDF = 'PDF',
  DOCX = 'DOCX',
}

/** The same shape QueryQuestionsDto filters by, minus paging — "everything
 * currently matching the Question Bank's filters" for a "select all
 * filtered" export. */
export class ExportFilterDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

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
  tag?: string;

  @IsOptional()
  mine?: boolean;

  @IsOptional()
  search?: string;
}

/**
 * Admin Question Bank export (§ Product Structure): a manual tick-list
 * (`ids`) or "everything currently filtered" (`filters`) — never an
 * unbounded whole-bank dump. `ids` wins when both are sent, matching the UI's
 * own rule ("Select these N" vs "Export all filtered").
 */
export class ExportQuestionsDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ExportFilterDto)
  filters?: ExportFilterDto;

  @IsEnum(ExportFormat)
  format!: ExportFormat;

  /** false = "Questions Only" — the correct answer is never included. */
  @IsBoolean()
  includeAnswers!: boolean;
}
