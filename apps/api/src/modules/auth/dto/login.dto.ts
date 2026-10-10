import { ApiProperty } from '@nestjs/swagger';
import { STAFF_LOGIN_FIELD, STUDENT_LOGIN_FIELD } from '@drsk/shared';
import {
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';

import { Role } from '../auth.types';

/**
 * A non-empty string, reported in one sentence that names the field the way
 * the sign-in form labels it.
 *
 * The login page shows a 400's messages verbatim, so `@IsString()` plus
 * `@MinLength(1)` would put "rollNumber must be longer than or equal to 1
 * characters" in front of a student — twice over for a missing field, once
 * per decorator. Accepts exactly what that pair accepted.
 */
function IsFilledIn(label: string): PropertyDecorator {
  return ValidateBy({
    name: 'isFilledIn',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && value.length > 0,
      defaultMessage: () => `${label} is required`,
    },
  });
}

const EMAIL = STAFF_LOGIN_FIELD.email.label;

/** Staff login (superadmin/admin/teacher) — by email. */
export class LoginDto {
  @ApiProperty({
    description: `Shown on the sign-in form as "${EMAIL}".`,
    example: 'you@institute.edu',
  })
  @IsEmail(
    {},
    {
      message: ({ value }: ValidationArguments) =>
        typeof value === 'string' && value.length > 0
          ? `${EMAIL} must be a valid email address`
          : `${EMAIL} is required`,
    },
  )
  email: string;

  @ApiProperty({
    description: `Shown on the sign-in form as "${STAFF_LOGIN_FIELD.password.label}".`,
  })
  @IsFilledIn(STAFF_LOGIN_FIELD.password.label)
  password: string;
}

/**
 * Student login — by Institute ID + Registration Number (unique per
 * institute). Each field is validated under the label the sign-in form and
 * the credentials email give it.
 */
export class StudentLoginDto {
  @ApiProperty({
    description: `Shown on the sign-in form as "${STUDENT_LOGIN_FIELD.instituteSlug.label}".`,
    example: 'sunrise-academy',
  })
  @IsFilledIn(STUDENT_LOGIN_FIELD.instituteSlug.label)
  instituteSlug: string;

  @ApiProperty({
    description: `Shown on the sign-in form as "${STUDENT_LOGIN_FIELD.rollNumber.label}". Server-generated and unique within the institute.`,
    example: '2400183920',
  })
  @IsFilledIn(STUDENT_LOGIN_FIELD.rollNumber.label)
  rollNumber: string;

  @ApiProperty({
    description: `Shown on the sign-in form as "${STUDENT_LOGIN_FIELD.password.label}".`,
  })
  @IsFilledIn(STUDENT_LOGIN_FIELD.password.label)
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

/**
 * POST /auth/login/resend — re-sends a fresh code for the same challenge.
 *
 * The endpoint accepts ONLY a challengeId: never an email. An email plus a
 * "send me a code" payload would be an email-enumeration login on top of an
 * inbox-spam path; the server-side challengeId is the one thing a resend
 * is entitled to know. Login screens keep their challengeId in component
 * state for exactly this reason.
 */
export class ResendLoginOtpDto {
  @IsUUID()
  challengeId: string;
}

/** Which of the caller's own roles this session should act as. */
export class SelectRoleDto {
  @IsEnum(Role)
  role: Role;
}
