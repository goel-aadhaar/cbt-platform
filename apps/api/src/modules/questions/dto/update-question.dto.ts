import { PartialType } from '@nestjs/swagger';

import { CreateQuestionDto } from './create-question.dto';

/** All fields optional; the service re-validates content and enforces who may
 * edit (author's own draft, or an admin on any non-archived question). */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}
