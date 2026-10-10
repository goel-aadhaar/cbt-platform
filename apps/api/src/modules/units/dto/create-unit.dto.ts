import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUnitDto {
  @IsUUID()
  subjectId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
