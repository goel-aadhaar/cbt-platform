import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** Reassign the student to a different batch (in the same institute). */
  @IsOptional()
  @IsUUID()
  batchId?: string;
}
