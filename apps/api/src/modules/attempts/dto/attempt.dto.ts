import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ProctoringEventType } from '../attempt.types';

export class StartAttemptDto {
  @IsUUID()
  examId: string;
}

export class RecordSectionTimeDto {
  @IsUUID()
  sectionId: string;

  /** Seconds elapsed in this section SINCE THE LAST REPORT (a delta, not a total). */
  @IsInt()
  @Min(0)
  @Max(3600)
  seconds: number;
}

export class ReportViolationDto {
  @IsEnum(ProctoringEventType)
  type: ProctoringEventType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}

export class SaveResponseDto {
  /** Selected answer (MCQ key / MSQ keys / integer); null or omitted clears it. */
  @IsOptional()
  answer?: string | number | string[] | null;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}
