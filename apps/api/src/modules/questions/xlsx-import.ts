import { sheetRecords } from '../../common/spreadsheet/read-workbook';

import { ParsedQuestion } from './ports/question-import.port';

/**
 * Spreadsheet question import (§2.4).
 *
 * A DOCX paper is prose a teacher already had; a spreadsheet is the shape a
 * teacher *builds a bank* in — one row per question, options in their own
 * columns, filterable and sortable before it is ever uploaded. Neither replaces
 * the other, so both are accepted.
 *
 * Each row becomes a {@link ParsedQuestion}, which is exactly what the DOCX
 * parser produces — so validation, taxonomy resolution, per-question defaults
 * and creation are the code that already existed, not a second copy of it.
 *
 * ## Columns
 *
 * Required: `statement`, `answer`.
 * Options:  `optiona` … `optionh` (or `a` … `h`), omit for INTEGER questions.
 * Optional: `type`, `difficulty`, `marks`, `negativemarks`, `explanation`,
 *           `tags`, `language`.
 *
 * Headers are matched case-insensitively with spaces removed, so
 * "Option A", "option a" and "optiona" are the same column, and "Negative
 * Marks" reaches the same key the DOCX path uses.
 *
 * Subject, chapter and exam category are **not** read from the sheet: they are
 * chosen once for the whole file in the import dialog, because they must
 * resolve to real taxonomy rows rather than whatever text a cell happened to
 * contain. Same rule the DOCX import follows.
 */

/** Accepted spellings for one option column, in order A–H. */
const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function optionFor(
  row: Record<string, string>,
  letter: string,
): string | undefined {
  const candidates = [
    `option${letter}`,
    `option${letter}.`,
    `opt${letter}`,
    letter,
  ];
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

/** Columns that are metadata rather than content, mapped to the DOCX meta keys. */
const META_COLUMNS: Record<string, string> = {
  type: 'type',
  difficulty: 'difficulty',
  marks: 'marks',
  negativemarks: 'negativemarks',
  negative: 'negativemarks',
  explanation: 'explanation',
  tags: 'tags',
  language: 'language',
};

export async function parseQuestionSheet(
  buffer: Buffer,
): Promise<ParsedQuestion[]> {
  const rows = await sheetRecords(buffer, {
    // `statement` alone identifies the table: `answer` may legitimately be
    // absent from a partly-filled sheet, and refusing to find the table at all
    // would hide the per-row errors that tell the author what to fix.
    required: ['statement|question'],
    maxRows: 1000,
  });
  const questions: ParsedQuestion[] = [];

  for (const { row: sourceRow, data: row } of rows) {
    const statement = (row.statement ?? row.question ?? '').trim();
    // A row with no statement is padding, not a failure — spreadsheets are full
    // of trailing rows that carry a stray format but no content. A row with a
    // statement and no answer IS a failure, and is left for resolveDraft to
    // report against its own line so the teacher can find it.
    if (!statement) continue;

    const options: { key: string; text: string }[] = [];
    for (const letter of OPTION_KEYS) {
      const text = optionFor(row, letter);
      if (text === undefined) continue;
      options.push({ key: letter.toUpperCase(), text });
    }

    const meta: Record<string, string> = {};
    for (const [column, key] of Object.entries(META_COLUMNS)) {
      const value = row[column];
      if (value !== undefined && value !== '') meta[key] = value;
    }

    questions.push({
      statement,
      options,
      answer: (row.answer ?? row.correctanswer ?? row.key ?? '').trim() || null,
      meta,
      // A spreadsheet cell cannot hold a diagram in any portable way. Rather
      // than pretend, media is attached afterwards by editing the question —
      // the DOCX path is the one that carries images.
      images: [],
      // The row the author will look at when told this question failed. A
      // Word document has no such thing, so it stays undefined there and the
      // importer falls back to the question's position in the file.
      sourceRow,
    });
  }

  return questions;
}
