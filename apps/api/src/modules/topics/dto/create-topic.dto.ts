import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTopicDto {
  @IsUUID()
  chapterId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
