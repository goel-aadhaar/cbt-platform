import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { ExamQuestionScoring } from '../../../generated/prisma/enums';

/**
 * Post-exam grace-marks decision for a single question (§2.9).
 *   NORMAL  — score against the answer key (default)
 *   BONUS   — award full marks to every candidate
 *   DROPPED — remove the question from scoring and from the max marks
 */
export class SetScoringDto {
  @ApiProperty({ enum: ExamQuestionScoring })
  @IsEnum(ExamQuestionScoring)
  override!: ExamQuestionScoring;
}
