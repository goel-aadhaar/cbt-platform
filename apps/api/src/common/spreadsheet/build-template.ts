import { Workbook } from 'exceljs';

/**
 * Build a filled-in import template.
 *
 * A template is the cheapest thing that makes a bulk import work first time:
 * the columns are exactly what the parser reads, spelled the way it expects,
 * with one worked example row so the shape of a value is obvious rather than
 * guessed. Generated on the server for the same reason the parser lives there
 * — if the columns ever change, the template changes with them instead of
 * drifting out of date in a hand-written file.
 *
 * The example row is deliberately real data, not `<your text here>` placeholder
 * markers: an author who forgets to delete it imports one harmless sample
 * question rather than a row of angle brackets.
 */
export async function buildTemplate(params: {
  sheetName: string;
  headers: string[];
  /** One or more example rows, in the same order as `headers`. */
  examples: (string | number)[][];
  /** Shown on a second sheet, so the first sheet stays machine-readable. */
  notes: string[];
}): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Codonmind Nexus';
  wb.created = new Date();

  const ws = wb.addWorksheet(params.sheetName);
  ws.addRow(params.headers);
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF3F8' },
  };
  header.commit();
  // Frozen so the columns stay visible while a long paper is pasted in.
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of params.examples) ws.addRow(row);

  params.headers.forEach((h, i) => {
    const longest = Math.max(
      h.length,
      ...params.examples.map((r) => String(r[i] ?? '').length),
    );
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 4, 12), 60);
  });

  const help = wb.addWorksheet('How to use');
  help.getColumn(1).width = 110;
  for (const line of params.notes) {
    const row = help.addRow([line]);
    if (line.endsWith(':')) row.font = { bold: true };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
