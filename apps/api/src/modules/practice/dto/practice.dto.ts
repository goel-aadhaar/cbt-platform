import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * A single answer to grade. The client never receives `answerKey`, so checking
 * has to round-trip — that is deliberate: a DPP question may also appear in a
 * live exam, and shipping keys to the browser would leak those answers.
 */
export class CheckAnswerDto {
  @IsUUID()
  questionId!: string;

  /** string (MCQ key), string[] (MSQ keys) or number (INTEGER). */
  @IsDefined()
  answer!: string | number | string[];
}

/**
 * Opens a session over one named DPP (§ Product Structure). Unlike an exam
 * attempt this is not access-gated by a begin() call with a server timer —
 * DPP is untimed by design — but the DPP itself must be one the student's
 * batch was actually assigned, which the service checks before handing back
 * a single question.
 */
export class StartSessionDto {
  @IsUUID()
  dppId!: string;
}

export class CompleteSessionDto {
  /** Wall-clock seconds the student spent, reported by the client. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}
