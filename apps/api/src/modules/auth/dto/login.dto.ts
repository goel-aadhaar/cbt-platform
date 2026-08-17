import {
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

import { Role } from '../auth.types';

/** Staff login (superadmin/admin/teacher) — by email. */
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

/** Student login — by institute + roll number (roll number is unique per institute). */
export class StudentLoginDto {
  @IsString()
  @MinLength(1)
  instituteSlug: string;

  @IsString()
  @MinLength(1)
  rollNumber: string;

  @IsString()
  @MinLength(1)
  password: string;
}

/** Step 2 of a non-student login: the emailed one-time code. */
export class VerifyOtpDto {
  @IsUUID()
  challengeId: string;

  /** Exactly six digits — anything else cannot be a code we issued. */
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

/** Which of the caller's own roles this session should act as. */
export class SelectRoleDto {
  @IsEnum(Role)
  role: Role;
}
