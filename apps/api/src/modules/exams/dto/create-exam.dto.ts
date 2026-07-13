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

import { ResultPolicy } from '../exam.types';

export class CreateExamDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

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

  @IsOptional()
  @IsEnum(ResultPolicy)
  resultPolicy?: ResultPolicy;
}
