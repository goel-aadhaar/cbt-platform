import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';

export const INSTITUTE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const INSTITUTE_SLUG_MESSAGE =
  'slug must be lowercase alphanumeric words separated by hyphens';

/** Words that would read as platform pages or roles on the sign-in screen. */
export const RESERVED_INSTITUTE_SLUGS: readonly string[] = [
  'admin',
  'api',
  'login',
  'platform',
  'superadmin',
  'www',
  'app',
  'student',
  'teacher',
];

/**
 * The optional, editable Institute ID (`Institute.slug`) on the two update
 * DTOs: what a student types as "Institute ID" at sign-in. Trimmed and
 * lowercased before validation so "  Sunrise-Academy " is accepted as
 * `sunrise-academy`.
 */
export function IsInstituteSlug(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      example: 'sunrise-academy',
      description:
        'The Institute ID students type at sign-in. Lowercase letters, ' +
        'numbers and hyphens, 3-40 characters. Changing it invalidates the ' +
        'ID printed in credential emails already sent.',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsOptional(),
    IsString(),
    MinLength(3, { message: 'Institute ID must be at least 3 characters' }),
    MaxLength(40, { message: 'Institute ID must be at most 40 characters' }),
    Matches(INSTITUTE_SLUG_PATTERN, {
      message:
        'Institute ID must be lowercase letters and numbers, with words separated by single hyphens',
    }),
    IsNotReservedInstituteSlug(),
  );
}

/** Rejects an Institute ID that would read as a platform page or role. */
export function IsNotReservedInstituteSlug(): PropertyDecorator {
  return ValidateBy({
    name: 'isNotReservedInstituteSlug',
    validator: {
      validate: (value: unknown) =>
        typeof value !== 'string' || !RESERVED_INSTITUTE_SLUGS.includes(value),
      defaultMessage: () =>
        'That Institute ID is reserved. Choose a different one',
    },
  });
}
