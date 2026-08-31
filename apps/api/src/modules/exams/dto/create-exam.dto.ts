import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

import { ExamKind, ResultPolicy } from '../exam.types';

export class CreateExamDto {
  /**
   * MOCK_TEST (default) or ASSESSMENT (§ Assessments) — picks which workflow
   * this exam follows for the rest of its life. Omitted by every existing
   * caller, so every existing exam-creation path is unaffected.
   */
  @IsOptional()
  @IsEnum(ExamKind)
  kind?: ExamKind;

  @IsString()
  @MinLength(2)
  title: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  /** Minimum total marks to pass, shown on results. Omit for no pass/fail line. */
  @IsOptional()
  @IsInt()
  @Min(0)
  passingMarks?: number;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  calculatorEnabled?: boolean;

  /** Proctoring: require full screen (client-enforced). Default true. */
  @IsOptional()
  @IsBoolean()
  fullscreenRequired?: boolean;

  /** Proctoring: auto-submit + flag after this many violations (0 = warnings only). */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxViolations?: number;

  @IsOptional()
  @IsUUID()
  programId?: string;

  /**
   * The catalogue entry this paper belongs to (§2.3). On approval the paper is
   * renamed "<Category> - <n>", so candidates see a predictable series.
   */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ResultPolicy)
  resultPolicy?: ResultPolicy;
}
