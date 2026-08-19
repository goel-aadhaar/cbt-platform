import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
