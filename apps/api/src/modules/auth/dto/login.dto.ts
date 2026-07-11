import { IsEmail, IsString, MinLength } from 'class-validator';

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
