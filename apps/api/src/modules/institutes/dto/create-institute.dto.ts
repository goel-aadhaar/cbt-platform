import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import {
  INSTITUTE_SLUG_MESSAGE,
  INSTITUTE_SLUG_PATTERN,
  IsNotReservedInstituteSlug,
} from './institute-slug';

export class CreateInstituteDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** The Institute ID students sign in with (used for student login routing). */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MinLength(3, { message: 'Institute ID must be at least 3 characters' })
  @MaxLength(40, { message: 'Institute ID must be at most 40 characters' })
  @Matches(INSTITUTE_SLUG_PATTERN, { message: INSTITUTE_SLUG_MESSAGE })
  @IsNotReservedInstituteSlug()
  slug: string;
}
