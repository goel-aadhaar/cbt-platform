import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
  ValidationArguments,
  registerDecorator,
} from 'class-validator';

import { Difficulty, QuestionType } from '../question.types';

/** Media keys are `${instituteId}/${uuid}${ext}` — path-safe characters only. */
export const MEDIA_KEY_PATTERN = /^[A-Za-z0-9._/-]+$/;

/** An option must say something or show something: text, or an image. */
export function optionHasContent(o: {
  text?: unknown;
  mediaKey?: unknown;
}): boolean {
  const hasText = typeof o.text === 'string' && o.text.trim().length > 0;
  const hasImage = typeof o.mediaKey === 'string' && o.mediaKey.length > 0;
  return hasText || hasImage;
}

function OptionHasTextOrImage() {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'optionHasTextOrImage',
      target: target.constructor,
      propertyName,
      validator: {
        validate: (_value: unknown, args: ValidationArguments) =>
          optionHasContent(args.object),
        defaultMessage: () => 'Each option needs text or an image',
      },
    });
  };
}

export class QuestionOptionDto {
  @IsString()
  @MinLength(1)
  key: string;

  /** May be empty when an image carries the option. */
  @IsString()
  @OptionHasTextOrImage()
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(MEDIA_KEY_PATTERN, { message: 'mediaKey is not a valid media key' })
  mediaKey?: string;
}

export class CreateQuestionDto {
  @IsUUID()
  subjectId: string;

  @IsUUID()
  chapterId: string;

  /** Nullable so an update can explicitly clear it (§ taxonomy). */
  @IsOptional()
  @IsUUID()
  topicId?: string | null;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsOptional()
  @IsString()
  language?: string;

  /**
   * The Exam Categories catalogue entry this question is suited for (§2.3) —
   * optional, since a question can exist with no exam type assigned yet.
   * Nullable so an update can explicitly clear it.
   */
  @IsOptional()
  @IsUUID()
  examCategoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @MinLength(1)
  statement: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  /** MCQ: option key ("A"); MSQ: keys (["A","C"]); INTEGER: a number. */
  @IsDefined()
  answerKey: string | number | string[];

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsNumber()
  marks?: number;

  @IsOptional()
  @IsNumber()
  negativeMarks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaKeys?: string[];

  /**
   * ADMIN only, and true by default for them: an administrator's question goes
   * straight into the bank rather than into a queue only they can clear.
   * Send `false` to keep it as a draft instead. Ignored for a teacher, whose
   * questions are always drafts until an admin approves them.
   */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
