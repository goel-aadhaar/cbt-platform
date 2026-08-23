import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Which subject shelf this belongs on. */
  @IsUUID()
  subjectId: string;

  /** Who it is for. Required — see the model for why it is not nullable. */
  @IsUUID()
  batchId: string;

  /**
   * The already-uploaded file, by media key.
   *
   * Uploading and filing are two steps on purpose: the upload is a multipart
   * request that can fail on size or type, and pairing it with the metadata
   * would mean re-typing the title every time a file was rejected.
   */
  @IsString()
  @MinLength(1)
  mediaKey: string;
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
  batchId?: string;
}
