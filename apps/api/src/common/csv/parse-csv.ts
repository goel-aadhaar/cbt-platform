/**
 * Minimal RFC 4180 CSV parser (the read counterpart of {@link ./to-csv}).
 * Handles quoted fields, embedded commas/newlines, doubled quotes, a leading
 * BOM, and both LF and CRLF line endings — no external dependency.
 */
export function parseCsv(input: string): string[][] {
  // Strip a leading UTF-8 BOM if present (e.g. a file exported from Excel).
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  // Flush the trailing field/row when the file does not end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV into records keyed by the (lower-cased, trimmed) header row.
 * Fully blank lines are skipped and every cell is trimmed.
 */
export function csvRecords(input: string): Record<string, string>[] {
  const rows = parseCsv(input).filter((r) =>
    r.some((cell) => cell.trim() !== ''),
  );
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = (cells[i] ?? '').trim();
    });
    return record;
  });
}

/** One parsed record, with the file line it came from. */
export interface SourceRecord {
  /** 1-based line in the original file, for error messages a human can act on. */
  row: number;
  data: Record<string, string>;
}

/**
 * Like {@link csvRecords}, but each record remembers which line it came from.
 *
 * Blank lines are skipped, so the Nth record is not necessarily the (N+1)th
 * line. Reporting a computed position instead of the real one sends the user to
 * the wrong row of their own file, which is worse than giving no row at all.
 */
export function csvRows(input: string): SourceRecord[] {
  const all = parseCsv(input);
  const firstIdx = all.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (firstIdx === -1) return [];

  const headers = all[firstIdx].map((h) => h.trim().toLowerCase());
  const out: SourceRecord[] = [];
  for (let i = firstIdx + 1; i < all.length; i++) {
    const cells = all[i];
    if (!cells.some((c) => c.trim() !== '')) continue;
    const data: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) data[h] = (cells[j] ?? '').trim();
    });
    out.push({ row: i + 1, data });
  }
  return out;
}
