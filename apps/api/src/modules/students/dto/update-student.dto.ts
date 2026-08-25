import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /**
   * Reassign the student to a different batch (in the same institute).
   *
   * The institute boundary is enforced by the service — passing a batchId from
   * another tenant returns 400, not silently accepted.
   */
  @IsOptional()
  @IsUUID()
  batchId?: string;
}
