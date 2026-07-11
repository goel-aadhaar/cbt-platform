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

export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<readonly CsvCell[]>,
): string {
  const escape = (value: CsvCell): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
}

/** Prefix a UTF-8 BOM so spreadsheet apps detect the encoding of a download. */
export function withBom(csv: string): string {
  return BOM + csv;
}
