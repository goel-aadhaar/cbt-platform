import {
  ArrayMinSize,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsNumber()
  marksCorrect?: number;

  /** Marks subtracted per wrong answer (positive number). */
  @IsOptional()
  @IsNumber()
  marksWrong?: number;
}

export class AddQuestionDto {
  @IsUUID()
  questionId: string;
}

export class AssignBatchDto {
  @IsUUID()
  batchId: string;
}

export class ScheduleExamDto {
  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;
}

export class CloneExamDto {
  /** Title for the clone; defaults to "<source title> (Copy)". */
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;
}

/** Hand a finished draft to a named admin for approval (§2.3). */
export class SubmitExamDto {
  /** Admin of this institute who should review the paper. */
  @IsUUID()
  reviewerId!: string;
}

/** Send a submitted exam back to its author. */
export class RejectExamDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Drag-and-drop reordering (§ exam authoring) — the full new order, by id. */
export class ReorderSectionsDto {
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  sectionIds!: string[];
}

export class ReorderQuestionsDto {
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  examQuestionIds!: string[];
}
