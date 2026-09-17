import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** `true` restores an archived class; `false` archives it. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
