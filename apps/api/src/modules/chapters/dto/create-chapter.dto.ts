import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateChapterDto {
  @IsUUID()
  subjectId: string;

  /** Optional parent unit — must belong to `subjectId`. */
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsString()
  @MinLength(1)
  name: string;
}
