import { IsString, Matches, MinLength } from 'class-validator';

export class CreateInstituteDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** URL-safe unique tenant identifier (used for student login routing). */
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  slug: string;
}
