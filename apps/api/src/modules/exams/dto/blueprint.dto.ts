import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

import { percentsSumToHundred } from '../blueprint';

/** Items must name each chapter once. */
function UniqueChapters(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'uniqueChapters',
      target: target.constructor,
      propertyName,
      options: {
        message: 'Each chapter can appear only once',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          const ids = value.map((v: { chapterId?: unknown }) => v?.chapterId);
          return new Set(ids).size === ids.length;
        },
      },
    });
}

/** Chapter percents must add up to 100 (within a hundredth). */
function PercentsSumTo100(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'percentsSumTo100',
      target: target.constructor,
      propertyName,
      options: {
        message: (args: ValidationArguments) =>
          `${args.property} percents must add up to 100`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          return percentsSumToHundred(
            value.map((v: { percent?: unknown }) => Number(v?.percent)),
          );
        },
      },
    });
}

export class BlueprintPickItemDto {
  @IsUUID()
  chapterId!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  percent!: number;
}

export class BlueprintPickDto {
  @IsUUID()
  subjectId!: string;

  @IsInt()
  @Min(1)
  @Max(300)
  total!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BlueprintPickItemDto)
  @UniqueChapters()
  @PercentsSumTo100()
  items!: BlueprintPickItemDto[];

  /** Questions already used elsewhere in the exam; never picked again. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  excludeQuestionIds?: string[];

  /** Fixes the shuffle, so a pick can be reproduced (used by tests). */
  @IsOptional()
  @IsInt()
  seed?: number;
}

export class SectionBlueprintItemDto {
  @IsUUID()
  chapterId!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  percent!: number;

  @IsInt()
  @Min(0)
  count!: number;
}

/** The weightage a section was built to; informational, never read by scoring. */
export class SectionBlueprintDto {
  @IsInt()
  @Min(1)
  @Max(300)
  total!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SectionBlueprintItemDto)
  @UniqueChapters()
  @PercentsSumTo100()
  items!: SectionBlueprintItemDto[];
}

export class BlueprintChaptersQueryDto {
  @IsUUID()
  subjectId!: string;
}
