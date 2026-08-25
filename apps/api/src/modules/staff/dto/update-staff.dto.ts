import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Role } from '../../auth/auth.types';

/**
 * Roles an institute administrator may assign.
 *
 * SUPERADMIN is deliberately absent: it is platform-level, granted out of band,
 * and letting an institute admin write it into `roles` would be a privilege
 * escalation from tenant scope to global scope. STUDENT is absent because a
 * student is not staff — they have a `Student` record and a roll number, and
 * flipping a staff account into one would leave that record missing.
 */
export const ASSIGNABLE_ROLES = [Role.TEACHER, Role.ADMIN] as const;

/**
 * Permissive phone shape: digits, spaces, +, -, parens. Length-bounded.
 *
 * Strict E.164 validation would be wrong here — a "Contact number, maintained
 * by the user themselves" field (§ User schema) is widely accepted as the
 * thing that catches typos by not rejecting them. The UI never renders this
 * for outgoing communication; it is recovered only when the user themselves
 * cannot log in.
 */
const PHONE_RE = /^[0-9 +()-]{6,20}$/;

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_RE, { message: 'phone may contain digits, spaces, +, -, ()' })
  @MaxLength(20)
  phone?: string | null;

  /**
   * Replace the account's roles outright (not a partial merge), so removing a
   * role is expressible. Omit to leave them untouched.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ASSIGNABLE_ROLES.length)
  @ArrayUnique()
  @IsEnum(ASSIGNABLE_ROLES, { each: true })
  roles?: (typeof ASSIGNABLE_ROLES)[number][];
}
