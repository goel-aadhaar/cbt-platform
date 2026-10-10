import { Workbook } from 'exceljs';

import { parseQuestionSheet } from './xlsx-import';

async function sheet(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Questions');
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseQuestionSheet source numbering', () => {
  it('assigns sourceSeq by row position and reads the serial column', async () => {
    const buf = await sheet([
      ['Sr No', 'Statement', 'OptionA', 'OptionB', 'Answer'],
      [1, 'First?', 'x', 'y', 'A'],
      [2, 'Second?', 'x', 'y', 'B'],
      ['Q10', 'Tenth?', 'x', 'y', 'A'],
    ]);
    const qs = await parseQuestionSheet(buf);
    expect(qs.map((q) => q.sourceSeq)).toEqual([1, 2, 3]);
    expect(qs.map((q) => q.sourceLabel)).toEqual(['1', '2', 'Q10']);
    expect(qs.map((q) => q.statement)).toEqual(['First?', 'Second?', 'Tenth?']);
  });

  it('leaves a gap for a row with no statement instead of renumbering', async () => {
    const buf = await sheet([
      ['no', 'statement', 'answer'],
      [1, 'One?', 'A'],
      [2, null, 'A'],
      [3, 'Three?', 'A'],
    ]);
    const qs = await parseQuestionSheet(buf);
    expect(qs.map((q) => q.sourceSeq)).toEqual([1, 3]);
    expect(qs.map((q) => q.sourceLabel)).toEqual(['1', '3']);
  });

  it('works without a serial column', async () => {
    const buf = await sheet([
      ['statement', 'answer'],
      ['One?', 'A'],
    ]);
    const [q] = await parseQuestionSheet(buf);
    expect(q.sourceSeq).toBe(1);
    expect(q.sourceLabel).toBeUndefined();
  });

  it.each(['#', 'S.No', 'serial', 'Q No', 'sr'])(
    'accepts %s as the serial column',
    async (header) => {
      const buf = await sheet([
        [header, 'statement', 'answer'],
        [7, 'One?', 'A'],
      ]);
      const [q] = await parseQuestionSheet(buf);
      expect(q.sourceLabel).toBe('7');
    },
  );
});
