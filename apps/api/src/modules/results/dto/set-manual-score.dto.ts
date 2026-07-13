import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID } from 'class-validator';

/**
 * Award manual marks to one candidate for one question that has been set to
 * MANUAL evaluation (§2.5). Re-run evaluate() to apply.
 */
export class SetManualScoreDto {
  @ApiProperty()
  @IsUUID()
  attemptId: string;

  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty({ description: 'Marks to award this candidate (may be 0).' })
  @IsNumber()
  marks: number;
}
