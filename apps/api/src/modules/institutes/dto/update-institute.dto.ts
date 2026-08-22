import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateInstituteDto {
  @ApiPropertyOptional({ example: 'Sunrise Academy (North Campus)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  /**
   * Suspends the tenant. Everyone belonging to it is refused at login, and
   * existing sessions stop working, so this is the safe alternative to deleting
   * an institute that still holds exam records.
   */
  @ApiPropertyOptional({
    example: false,
    description:
      'Suspend or restore the tenant. Suspended tenants cannot sign in.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
