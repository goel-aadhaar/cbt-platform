import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** One candidate's award, addressed by their attempt. */
export class ManualAwardDto {
  @ApiProperty()
  @IsUUID()
  attemptId: string;

  @ApiProperty({ description: 'Marks to award this candidate (may be 0).' })
  @IsNumber()
  @Min(0)
  marks: number;
}

/**
 * Award manual marks to many candidates for ONE question in a single call
 * (§2.5).
 *
 * Bulk because the per-candidate route re-evaluates the whole exam each time it
 * is called: grading a cohort one request at a time would re-rank every
 * candidate once per award. The upper bound is generous but present — an
 * unbounded array here is an unbounded transaction.
 */
export class SetManualScoresDto {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty({ type: [ManualAwardDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ManualAwardDto)
  awards: ManualAwardDto[];
}
