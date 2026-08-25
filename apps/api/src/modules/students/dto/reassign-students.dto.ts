import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Bulk-reassign students from one batch to another.
 *
 * Distinct from `UpdateStudentDto.batchId`: that one moves a single row from
 * the edit drawer; this is the operations-tool for end-of-term reshuffles —
 * "move all 47 retakers from Alpha to Beta" — and exists because doing it
 * row-by-row is slow enough that nobody on the operations side would actually
 * bother to correct a misclassified batch.
 *
 * Both the source batch and the target batch must already belong to the
 * actor's institute. The service rejects any id from a different tenant with
 * 400, treating the response the same as "ids do not exist" so a caller
 * cannot use this endpoint to discover other tenants' ids by status code.
 */
export class ReassignStudentsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(500)
  studentIds: string[];

  /**
   * The destination batch. Source is implied: each student's current batch is
   * read from the database, not from the request, so the same call cannot
   * accidentally relocate a student who has already moved.
   */
  @IsUUID('4')
  targetBatchId: string;
}
