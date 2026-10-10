import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
