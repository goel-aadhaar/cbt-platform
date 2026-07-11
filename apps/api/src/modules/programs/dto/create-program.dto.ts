import { IsString, MinLength } from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @MinLength(1)
  name: string;
}
