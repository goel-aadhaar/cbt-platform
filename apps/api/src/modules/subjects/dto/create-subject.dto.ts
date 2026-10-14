import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  name: string;

  /** Optional class (Program → Class) the subject sits under. */
  @IsOptional()
  @IsUUID()
  classId?: string;
}
