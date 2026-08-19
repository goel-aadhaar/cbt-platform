import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateChapterDto {
  @IsUUID()
  subjectId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
