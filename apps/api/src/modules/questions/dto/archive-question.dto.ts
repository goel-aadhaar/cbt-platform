import { IsBoolean, IsOptional } from 'class-validator';

/** Mirrors UpdateQuestionDto's confirm safeguard (§2.5) for archiving. */
export class ArchiveQuestionDto {
  /**
   * Archiving a question already used in an exam is rejected with 409 unless
   * the caller confirms. The client shows "This question has already been
   * used in exams. Continue?" and re-sends with `confirm: true`.
   */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
