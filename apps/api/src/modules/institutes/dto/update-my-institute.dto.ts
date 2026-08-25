import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Self-service edit for the caller's own institute (§ institute branding).
 * Deliberately separate from the superadmin's `UpdateInstituteDto` — no
 * `isActive` here; suspending/restoring a tenant stays a superadmin action.
 */
export class UpdateMyInstituteDto {
  @ApiPropertyOptional({ example: 'Sunrise Academy (North Campus)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  /**
   * Storage key of a `Media` row this institute already owns (uploaded via
   * `POST /media`, same picker as a question diagram) — the actual bytes are
   * never sent through this endpoint. `null` clears a custom logo, falling
   * back to the platform default everywhere it's shown.
   */
  @ApiPropertyOptional({
    example: 'a1b2c3d4-institute-logo.png',
    description:
      "Storage key of an already-uploaded image to use as the institute's " +
      'logo. Pass null to clear it and fall back to the default mark.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  logoKey?: string | null;
}
