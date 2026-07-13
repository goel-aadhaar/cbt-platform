import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateQuestionDto } from './create-question.dto';

/** All fields optional; the service re-validates content and enforces who may
 * edit (author's own draft, or an admin on any non-archived question). */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {
  /**
   * Edit safeguard (§2.5): editing a question already used in an examination is
   * rejected with 409 unless the caller confirms. The client shows "This
   * question has already been used in exams. Continue? YES / NO" and re-sends
   * with `confirm: true`.
   */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
