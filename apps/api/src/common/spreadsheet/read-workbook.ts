import { Workbook } from 'exceljs';

import { SourceRecord } from '../csv/parse-csv';

/**
 * Reading side of the spreadsheet helpers — the counterpart to the ExcelJS
 * writing already used by the result exports, so bulk import needs no new
 * dependency.
 *
 * The output is deliberately the same shape `csvRecords` produces: records
 * keyed by a normalised header row, every value a trimmed string. That lets an
 * importer accept `.xlsx` and `.csv` through one code path instead of two
 * parallel ones that drift.
 */

/**
 * `.xlsx` and `.docx` are both ZIP archives, so magic bytes alone cannot tell
 * them apart. A ZIP stores each entry's name uncompressed in its local header,
 * so the workbook part is findable in the raw bytes — reliable, and cheaper
 * than unzipping a file only to discover it is the wrong kind.
 */
export function isXlsx(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
  if (!isZip) return false;
  const head = buffer
    .subarray(0, Math.min(buffer.length, 8192))
    .toString('latin1');
  return head.includes('xl/workbook.xml') || head.includes('xl/worksheets/');
}

/** Same test for Word documents, for importers that accept several formats. */
export function isDocx(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) return false;
  const head = buffer
    .subarray(0, Math.min(buffer.length, 8192))
    .toString('latin1');
  return head.includes('word/document.xml');
}

/**
 * Flatten one cell to a trimmed string.
 *
 * Spreadsheets are not text files: a cell may hold a number, a date, a formula
 * (whose *result* is what the author sees), an error, or rich text assembled
 * from styled runs. Reading `cell.text` alone loses formula results and turns
 * dates into locale-dependent strings, so each case is handled explicitly —
 * this is where a naive reader silently imports the wrong thing.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();

  const obj = value as Record<string, unknown>;
  // Formula cell: take what it evaluated to, not the expression.
  if ('result' in obj) return cellToString(obj.result);
  // Hyperlink cell: the label, not the target.
  if ('text' in obj && typeof obj.text === 'string') return obj.text.trim();
  // Rich text: concatenate the runs.
  if (Array.isArray(obj.richText)) {
    return (obj.richText as { text?: string }[])
      .map((r) => r.text ?? '')
      .join('')
      .trim();
  }
  // An error cell (#REF!, #DIV/0!) is not a value — treat it as blank rather
  // than importing the error text as if the author had typed it.
  if ('error' in obj) return '';
  // Anything else is a shape this reader does not understand. Blank is the
  // honest answer: `String(obj)` would import the literal text
  // "[object Object]" as if a human had typed it into the cell.
  return '';
}

/** Normalised form of a header cell — the key an importer reads. */
function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/\s+/g, '');
}

/**
 * How far down a sheet to look for the header row.
 *
 * People put a title, a logo, a blank spacer or a "filled in by / date" block
 * above their table. Ten rows covers that comfortably without silently reading
 * a header out of the middle of somebody's data.
 */
const HEADER_SEARCH_DEPTH = 10;

export interface SheetReadOptions {
  /**
   * Columns the caller cannot work without, normalised (e.g. `['name','email']`).
   *
   * Given these, the reader finds the worksheet and the row that actually carry
   * them, instead of assuming the table starts at sheet 1 cell A1. Omit to take
   * the first sheet's first non-empty row as headers.
   *
   * An entry may name alternatives with `|` — `'statement|question'` matches a
   * header row carrying either, so an importer that already accepts a synonym
   * does not lose it here.
   */
  required?: string[];
  /** Stop after this many data rows. Bounds memory on a hostile file. */
  maxRows?: number;
}

/** One row of a worksheet, with the sheet row number it came from. */
interface GridRow {
  /** 1-based row in the worksheet, as the user sees it in Excel. */
  number: number;
  cells: string[];
}

/**
 * Flatten one worksheet to a grid of trimmed strings, keeping each row's real
 * number.
 *
 * The number has to be carried, not counted: blank rows are dropped and the
 * header may not be row 1, so the Nth record is rarely the (N+1)th row of the
 * sheet. An error that names the wrong row sends someone to the wrong line of
 * their own file.
 */
function gridOf(ws: import('exceljs').Worksheet): GridRow[] {
  const rows: GridRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    // `row.values` is 1-indexed with a leading hole, hence the slice. A sparse
    // row keeps its holes, so a gap in the middle does not shift every later
    // cell into the wrong column.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    for (const v of values) cells.push(cellToString(v));
    rows.push({ number: rowNumber, cells });
  });
  return rows.filter((r) => r.cells.some((c) => c !== ''));
}

/** Index of the first row carrying every required column, or -1. */
function findHeaderRow(rows: GridRow[], required: string[]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_DEPTH);
  for (let i = 0; i < limit; i++) {
    const keys = new Set(rows[i].cells.map(headerKey));
    const satisfied = required.every((r) =>
      r.split('|').some((alt) => keys.has(alt)),
    );
    if (satisfied) return i;
  }
  return -1;
}

function toRecords(
  rows: GridRow[],
  headerAt: number,
  maxRows?: number,
): SourceRecord[] {
  const headers = rows[headerAt].cells.map(headerKey);
  const body = rows.slice(headerAt + 1);
  const limited = maxRows ? body.slice(0, maxRows) : body;
  return limited.map(({ number, cells }) => {
    const data: Record<string, string> = {};
    headers.forEach((h, i) => {
      // A duplicate header would otherwise let a later blank column wipe a
      // filled one; first non-empty value for a key wins.
      if (!h) return;
      if (data[h] === undefined || data[h] === '') {
        data[h] = cells[i] ?? '';
      }
    });
    return { row: number, data };
  });
}

/**
 * Read a workbook into header-keyed records.
 *
 * Headers are lower-cased with inner whitespace removed, so "Negative Marks",
 * "negative marks" and "negativemarks" all arrive as one key and an importer
 * does not have to guess which spelling its users chose. Fully blank rows are
 * skipped — a spreadsheet almost always has trailing ones.
 *
 * With `required` set, the reader **searches** for the table rather than
 * assuming it starts at sheet 1 cell A1. Real files put a title above the
 * headers, or keep the roster on a later tab beside an instructions sheet, and
 * both used to fail as "no data rows" — a message that tells the user nothing
 * about what to change. Falling back to the first sheet's first row keeps the
 * "wrong columns" error intact for a file that genuinely has the wrong shape.
 */
export async function sheetRecords(
  buffer: Buffer,
  options: SheetReadOptions = {},
): Promise<SourceRecord[]> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  if (wb.worksheets.length === 0) return [];

  const { required, maxRows } = options;

  if (required?.length) {
    for (const ws of wb.worksheets) {
      const rows = gridOf(ws);
      if (rows.length === 0) continue;
      const headerAt = findHeaderRow(rows, required);
      if (headerAt >= 0) return toRecords(rows, headerAt, maxRows);
    }
  }

  const first = gridOf(wb.worksheets[0]);
  if (first.length === 0) return [];
  return toRecords(first, 0, maxRows);
}
