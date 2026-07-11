import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateClassDto {
  @IsUUID()
  programId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
