import { IsArray, IsUUID } from 'class-validator';

/** Full-replace: the complete set of batches this teacher should now have. */
export class SetStaffBatchesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  batchIds: string[];
}
