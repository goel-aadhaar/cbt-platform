import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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
