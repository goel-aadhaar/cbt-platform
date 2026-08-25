import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Edit form for a LIVE exam (PUBLISHED or PAUSED) — the admin-only escape
 * hatch. Separated from `UpdateExamDto` because the live set is a STRICT
 * subset: timing, instructions, pass-marks. You cannot, mid-window, edit the
 * paper's content (title, sections, questions, marks) — changing those would
 * invalidate work candidates have already done. The class-decorator boundary
 * here is the type-level gate that enforces that.
 *
 * `Coerce` on numbers accepts both number and string-from-form-form, since
 * the public surface occasionally gets parsed form data this way.
 */
export class UpdateLiveExamDto {
  /**
   * Total time the candidate is allotted, in minutes. Editable so a
   * mis-scheduled exam can be corrected without recreating it.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  /**
   * Window opens at. Editing the open-time forward pushes every IN_PROGRESS
   * attempt's `expiresAt` by the same delta so they are not silently
   * truncated mid-question. Paused attempts have no live `expiresAt` value
   * that needs to be moved at this point.
   */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  /**
   * Window closes at. Truncates any attempt whose `expiresAt` extends past
   * the new end (the candidate clock ticks down but cannot exceed the new
   * boundary), and the attempt will be auto-submitted on its next tick.
   */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  instructions?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  passingMarks?: number;
}
