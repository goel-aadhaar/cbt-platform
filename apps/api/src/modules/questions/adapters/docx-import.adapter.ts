import { Injectable } from '@nestjs/common';

import { extractDocxText, parseQuestions } from '../docx-import';
import {
  ParsedQuestion,
  QuestionImportPort,
} from '../ports/question-import.port';

/**
 * DOCX import adapter (§2.6, delivered implementation). Extracts the document
 * text with mammoth and parses it into question blocks using the approved
 * template conventions (Q:/1. markers, `A)` options, `Answer:`, `Key: value`).
 */
@Injectable()
export class DocxImportAdapter extends QuestionImportPort {
  readonly format = 'docx';

  async parse(buffer: Buffer): Promise<ParsedQuestion[]> {
    const text = await extractDocxText(buffer);
    return parseQuestions(text);
  }
}
