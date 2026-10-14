import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /**
   * Move the subject to this class, or send `null` to detach it. Omit to
   * leave the class alone. (`IsOptional` lets both null and undefined through;
   * the service tells them apart.)
   */
  @IsOptional()
  @IsUUID()
  classId?: string | null;
}
