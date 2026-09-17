import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** `true` restores an archived batch; `false` archives it. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
