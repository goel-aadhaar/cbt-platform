import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
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

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

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
