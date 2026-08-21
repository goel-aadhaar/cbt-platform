import { BadRequestException, Injectable } from '@nestjs/common';

import { isDocx, isXlsx } from '../../../common/spreadsheet/read-workbook';
import { extractDocxContent, parseQuestions } from '../docx-import';
import {
  ParsedQuestion,
  QuestionImportPort,
} from '../ports/question-import.port';
import { parseQuestionSheet } from '../xlsx-import';

/**
 * Import adapter (§2.6) that accepts either supported document format.
 *
 * The port is deliberately still `parse(buffer)`: the service should not have
 * to know, or be told, which format an upload is. Dispatching here means adding
 * a third format later is one branch in one file, and the service, the
 * controller and the whole downstream pipeline stay untouched.
 *
 * Detection is by content, not by filename extension or the browser-supplied
 * MIME type — both are trivially wrong (a workbook renamed `.docx`, a
 * `application/octet-stream` from a phone) and neither is worth trusting when
 * the consequence is a confusing parse failure instead of a clear message.
 *
 * `.docx` and `.xlsx` are both ZIP archives, so the two are told apart by the
 * part names inside them rather than by magic bytes.
 */
@Injectable()
export class QuestionImportAdapter extends QuestionImportPort {
  readonly format = 'docx+xlsx';

  async parse(buffer: Buffer): Promise<ParsedQuestion[]> {
    if (isXlsx(buffer)) {
      return this.guard('Excel workbook', () => parseQuestionSheet(buffer));
    }
    if (isDocx(buffer)) {
      return this.guard('Word document', async () => {
        const { text, images } = await extractDocxContent(buffer);
        return parseQuestions(text, images);
      });
    }
    throw new BadRequestException(
      'Unsupported file. Upload a Word document (.docx) or an Excel ' +
        'workbook (.xlsx). A file renamed to one of those extensions is still ' +
        'read by its contents, so re-save it in the real format.',
    );
  }

  /**
   * Turn an unreadable document into a 400 the uploader can act on.
   *
   * The format was identified from the file's own contents, so reaching here
   * means the file really is that format and really is damaged — truncated by a
   * failed download, half-written by a crashed export, or a recovered file the
   * office suite never finished repairing. Left alone, the underlying parser
   * throws and the uploader gets an opaque 500 that reads like the platform is
   * broken, when the fix is entirely on their side.
   */
  private async guard<T>(kind: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `That ${kind} could not be read — it looks damaged or incomplete. ` +
          'Open it, re-save it, and upload it again. ' +
          `(${err instanceof Error ? err.message : 'unreadable'})`,
      );
    }
  }
}
