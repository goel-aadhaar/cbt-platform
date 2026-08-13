import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Self-service profile edits.
 *
 * Email is deliberately absent: it is the login identifier for staff and a
 * unique key, so changing it needs a verification round-trip rather than a
 * PATCH. Roll number is absent too — it identifies a candidate in an
 * examination record and belongs to the administrator.
 */
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Ananya Nair' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  // Digits with the usual separators. Deliberately loose: this is a contact
  // number for support, not something the platform dials.
  @Matches(/^[+()\d][\d\s()-]{5,}$/, {
    message: 'phone must be a valid contact number',
  })
  phone?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'Student@123' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiPropertyOptional({ example: 'NewPassw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
