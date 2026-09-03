import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum ResourceType {
  FILE = 'FILE',
  YOUTUBE = 'YOUTUBE',
}

export class CreateResourceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ResourceType)
  type: ResourceType;

  /** Which subject shelf this belongs on. */
  @IsUUID()
  subjectId: string;

  /**
   * Which chapter within it. Required on creation even though the column is
   * nullable — the column is only nullable to carry material that predates the
   * chapter level (see resource.prisma). Nothing new should be filed loose.
   *
   * The service verifies it belongs to `subjectId`.
   */
  @IsUUID()
  chapterId: string;

  /**
   * Batches to share with. At least one: a resource nobody can reach is not a
   * draft, it is a file that quietly went nowhere.
   *
   * Authorisation is checked server-side against the teacher's own batches —
   * the dropdown that produced these ids is not the control.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  batchIds: string[];

  /**
   * The already-uploaded file, by media key. Required when type is FILE.
   *
   * Uploading and filing are two steps on purpose: the upload is a multipart
   * request that can fail on size or type, and pairing it with the metadata
   * would mean re-typing the title every time a file was rejected.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  mediaKey?: string;

  /**
   * Any supported YouTube URL, or a bare video id. Required when type is
   * YOUTUBE. Normalised to an id server-side; what the client sent is never
   * stored or echoed back as a link.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  youtubeUrl?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  /**
   * Omit to leave sharing untouched; a list replaces it outright, which is how
   * a batch is removed. It cannot be emptied — unsharing from everyone is a
   * delete, and saying so is better than leaving an unreachable row behind.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  batchIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  mediaKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  youtubeUrl?: string;
}

/** Filters for the flat list — used by search and the type filter. */
export class QueryResourcesDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  /** Free text over title, description, subject name and chapter name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
