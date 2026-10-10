import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const BULK_ACTIONS = ['submit', 'approve', 'reject'] as const;

/**
 * Move many questions through the review workflow at once. Exactly one of
 * `importRunId` (everything one upload created) or `ids` (up to 500) is sent.
 */
export class BulkQuestionActionDto {
  @IsOptional()
  @IsUUID()
  importRunId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids?: string[];

  @IsIn(BULK_ACTIONS)
  action: (typeof BULK_ACTIONS)[number];

  /** Why a rejection happened. Accepted for the caller's benefit; not stored yet. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
