import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /**
   * Move the chapter to this unit (must belong to the chapter's subject), or
   * send `null` to detach it. Omit to leave the unit alone. (`IsOptional`
   * lets both null and undefined through; the service tells them apart.)
   */
  @IsOptional()
  @IsUUID()
  unitId?: string | null;
}
