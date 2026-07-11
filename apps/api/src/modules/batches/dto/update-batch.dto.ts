import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
