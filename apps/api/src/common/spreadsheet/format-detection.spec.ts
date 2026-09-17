import { Workbook } from 'exceljs';

import { isDocx, isXlsx } from './read-workbook';

/**
 * Which reader a bulk upload is handed to (§ bulk import).
 *
 * Getting this wrong is not a graceful failure: a workbook mistaken for a CSV
 * is read as UTF-8 text, the ZIP bytes are nonsense as text, and the uploader
 * is told their perfectly good file "looks damaged or incomplete". That is
 * exactly what happened while detection only inspected the first 8 KB — the
 * entry it looks for is wherever the producing application chose to put it.
 */
describe('spreadsheet format detection', () => {
  async function workbookBuffer(pad: number): Promise<Buffer> {
    const wb = new Workbook();
    const sheet = wb.addWorksheet('Students');
    sheet.addRow(['name', 'email']);
    sheet.addRow(['Asha Rao', 'asha@example.com']);
    if (pad > 0) {
      // Bulk the file out so its parts cannot all sit in the first few KB.
      const filler = wb.addWorksheet('Filler');
      for (let i = 0; i < pad; i++) {
        filler.addRow([`row-${i}`, 'x'.repeat(200)]);
      }
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('recognises a small workbook', async () => {
    expect(isXlsx(await workbookBuffer(0))).toBe(true);
  });

  it('recognises a large real workbook', async () => {
    const buffer = await workbookBuffer(2000);
    expect(buffer.length).toBeGreaterThan(8192);
    expect(isXlsx(buffer)).toBe(true);
  });

  it('finds the workbook entry however far into the file it sits', () => {
    /**
     * The property that actually matters, pinned directly rather than via a
     * generated workbook: ExcelJS happens to emit `xl/worksheets/` in the
     * first couple of KB, so a file it produces cannot demonstrate this on
     * its own — but entry order is the producer's choice, and nothing
     * guarantees either marker lands early. Detection reads a ZIP's bytes,
     * so it must not stop looking after an arbitrary prefix.
     */
    const buffer = Buffer.concat([
      Buffer.from('PK\x03\x04', 'latin1'),
      Buffer.alloc(20_000, 0x41),
      Buffer.from('xl/workbook.xml', 'latin1'),
    ]);
    expect(isXlsx(buffer)).toBe(true);
  });

  it('does not mistake a CSV for a workbook', () => {
    expect(isXlsx(Buffer.from('name,email\nAsha,asha@example.com\n'))).toBe(
      false,
    );
  });

  it('does not mistake a workbook for a Word document', async () => {
    // Both are ZIPs, so this is the distinction the entry name exists to make.
    expect(isDocx(await workbookBuffer(0))).toBe(false);
  });

  it('rejects an empty or truncated-to-nothing buffer without throwing', () => {
    expect(isXlsx(Buffer.alloc(0))).toBe(false);
    expect(isXlsx(Buffer.from('PK'))).toBe(false);
  });
});
