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
  /**
   * Selected answer (MCQ key / MSQ keys / integer); null or omitted clears it.
   *
   * The shape must match what `isCorrect` in `results/scoring.ts` accepts:
   *   - MCQ:      string — exactly one of the question's option keys (single letter).
   *   - MSQ:      string[] — array of option keys, each a single letter.
   *   - INTEGER:  number — a finite integer.
   *
   * Anything else (an object, a boolean, a string with > 1 char, etc.) means
   * the client sent a malformed payload and the request should be rejected
   * before any scoring logic runs. The TS-declared union `string | number |
   * string[] | null` does NOT enforce that at runtime — class-validator's
   * `@IsString` / `@IsNumber` only check primitive kinds, not value shape,
   * so a body of `{answer: {x: 1}}` would pass validation and persist. The
   * stricter shape check lives in `validateAnswer()` below and runs after the
   * DTO validation passes.
   */
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

/**
 * Shape-validates `answer` for the question type. To be called from the
 * service AFTER the class-validator pass succeeds (the DTO alone doesn't
 * reject `{answer: {x: 1}}` — it just records whatever the client sent).
 *
 * Returns null on success; a string with the user-facing error message on
 * failure. The service turns the message into a 400 BadRequestException.
 *
 * @param type           question type — `MCQ`, `MSQ`, or `INTEGER`
 * @param options       question's options array, used to verify the MCQ/MSQ key
 *                      is one of the valid choices (A/B/...). Empty array
 *                      means the question has no options; in that case any
 *                      MCQ key is allowed (a question with no options can't be
 *                      answered — the caller is expected to know that).
 * @param answer        the saved answer; null/undefined clears it (always OK)
 * @param isMultiSelect true for MSQ, false for MCQ/INTEGER
 */
export function validateAnswer(
  type: 'MCQ' | 'MSQ' | 'INTEGER',
  options: ReadonlyArray<{ key: string }>,
  answer: unknown,
  isMultiSelect: boolean,
): string | null {
  if (answer === null || answer === undefined) return null;

  const optionKeys = new Set(options.map((o) => o.key));

  if (isMultiSelect) {
    // MSQ: an array of option keys.
    if (!Array.isArray(answer) || answer.some((v) => typeof v !== 'string')) {
      return 'MSQ answers must be an array of single-character option keys';
    }
    if (answer.length > 0 && answer.some((k) => !optionKeys.has(k as string))) {
      return 'MSQ answer contains a key that is not one of the question options';
    }
    return null;
  }

  if (type === 'MCQ') {
    if (typeof answer !== 'string') {
      return 'MCQ answer must be a single-character option key';
    }
    if (answer.length !== 1) {
      return 'MCQ answer must be exactly one option key';
    }
    if (optionKeys.size > 0 && !optionKeys.has(answer)) {
      return 'MCQ answer is not one of the question options';
    }
    return null;
  }

  if (type === 'INTEGER') {
    if (
      typeof answer !== 'number' ||
      !Number.isFinite(answer) ||
      !Number.isInteger(answer)
    ) {
      return 'INTEGER answer must be a finite integer';
    }
    return null;
  }

  return 'Unsupported question type';
}
