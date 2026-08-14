import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

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

/** Google Identity Services returns a signed ID token it calls `credential`. */
export class GoogleLoginDto {
  @IsString()
  @MinLength(20)
  credential: string;
}

/** Which of the caller's own roles this session should act as. */
export class SelectRoleDto {
  @IsEnum(Role)
  role: Role;
}
