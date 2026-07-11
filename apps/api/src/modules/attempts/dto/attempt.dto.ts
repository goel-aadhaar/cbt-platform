import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class StartAttemptDto {
  @IsUUID()
  examId: string;
}

export class SaveResponseDto {
  /** Selected answer (MCQ key / MSQ keys / integer); null or omitted clears it. */
  @IsOptional()
  answer?: string | number | string[] | null;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}
