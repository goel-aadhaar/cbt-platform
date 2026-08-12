import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export enum AnnouncementAudience {
  ALL_STUDENTS = 'ALL_STUDENTS',
  BATCH = 'BATCH',
}

export enum AnnouncementCategory {
  GENERAL = 'GENERAL',
  EXAM = 'EXAM',
  RESULT = 'RESULT',
  SCHEDULE = 'SCHEDULE',
  MAINTENANCE = 'MAINTENANCE',
}

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(AnnouncementCategory)
  category?: AnnouncementCategory;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  /** Required when `audience` is BATCH. */
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  /** Publish immediately. Omit (or false) to save as a draft. */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsEnum(AnnouncementCategory)
  category?: AnnouncementCategory;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsUUID()
  batchId?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}
