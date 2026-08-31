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

import { ExamKind } from '../../exams/exam.types';
import { ProctoringEventType } from '../attempt.types';

export class StartAttemptDto {
  @IsUUID()
  examId: string;
}

/** GET /attempts/available — defaults to MOCK_TEST in the service when omitted. */
export class ListAvailableDto {
  @IsOptional()
  @IsEnum(ExamKind)
  kind?: ExamKind;
}

export class DenyAttemptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
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

  /**
   * Milliseconds spent on this question SINCE THE LAST REPORT (a delta, not a
   * total) — accumulated server-side, mirroring `RecordSectionTimeDto.seconds`.
   * A delta is what survives the client's fire-and-forget autosave: two saves
   * racing add up correctly, whereas two "totals" would clobber each other.
   * Capped at one hour per report so a tab left open overnight can't book a
   * day of thinking time against a single question.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  timeSpentMs?: number;
}
