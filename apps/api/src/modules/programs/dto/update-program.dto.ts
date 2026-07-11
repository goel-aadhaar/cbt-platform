import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
