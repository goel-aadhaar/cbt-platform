import {
  IsArray,
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

  /**
   * Media keys for files attached to this notice.
   *
   * Keys, not URLs: the file lives in the media library and is addressed by
   * key, so moving the bucket or putting a CDN in front never invalidates a
   * notice that has already gone out.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentKeys?: string[];
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

  /**
   * Omit to leave the notice's attachments untouched; send `[]` to clear them.
   *
   * The distinction matters: an admin fixing a typo in the title sends only
   * `title`, and treating that as "no attachments" would strip the files off a
   * notice that has already gone out.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentKeys?: string[];
}
