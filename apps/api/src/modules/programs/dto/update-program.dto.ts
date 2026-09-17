import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** `true` restores an archived program; `false` archives it. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
