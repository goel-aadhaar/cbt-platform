/**
 * Serialize tabular data to RFC 4180 CSV.
 *
 * Fields containing a comma, double-quote, CR or LF are wrapped in double
 * quotes with embedded quotes doubled; null/undefined become empty. Rows are
 * separated by CRLF so the file opens cleanly in Excel as well as Unix tools.
 */
export type CsvCell = string | number | boolean | null | undefined;

/** UTF-8 byte-order mark — makes Excel detect the encoding of a CSV download. */
const BOM = String.fromCharCode(0xfeff);

const FORMULA_START = /^[\t\r]|^\s*[=+\-@]/;
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Stop a spreadsheet running an exported cell as a formula.
 *
 * Names and batch titles come from import files and sign-up forms, and the
 * person who opens the export is an admin on their own machine, so
 * `=HYPERLINK(...)` in a name is a real attack. A leading apostrophe keeps it
 * as text. Only text is touched: numbers pass through, and so do numbers that
 * reach here as strings (`toFixed` output such as "-12.50").
 */
export function safeSpreadsheetCell<T extends CsvCell>(value: T): T | string {
  if (typeof value !== 'string') return value;
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value)
    ? `'${value}`
    : value;
}

export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<readonly CsvCell[]>,
): string {
  const escape = (value: CsvCell): string => {
    const safe = safeSpreadsheetCell(value);
    const s = safe === null || safe === undefined ? '' : String(safe);
    // `;` and tab too: both split a cell in some Excel locales, which would put
    // the rest of the text at the start of a cell of its own.
    return /[",;\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
}

/** Prefix a UTF-8 BOM so spreadsheet apps detect the encoding of a download. */
export function withBom(csv: string): string {
  return BOM + csv;
}
