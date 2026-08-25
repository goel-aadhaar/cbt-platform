import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Both `pause` and `forceEnd` accept an optional short reason so the audit
 * row carries more than "admin pressed the button". Capped at 500 chars to
 * keep it from becoming a paste target for incident reports.
 */
export class AdminExamActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
