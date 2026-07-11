import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBatchDto {
  @IsUUID()
  classId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
