import { Workbook } from 'exceljs';

import { sheetRecords } from '../../common/spreadsheet/read-workbook';
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

describe('parseQuestionSheet rich text', () => {
  async function richSheet(): Promise<Buffer> {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Questions');
    ws.addRow([
      'statement',
      'optionA',
      'optionB',
      'answer',
      'explanation',
      'difficulty',
    ]);
    ws.addRow([
      {
        richText: [
          { text: 'Which is ' },
          { font: { bold: true }, text: 'not' },
          { text: ' CO' },
          { font: { vertAlign: 'subscript' }, text: '2' },
          { text: '?' },
        ],
      },
      {
        richText: [
          { text: 'x' },
          { font: { vertAlign: 'superscript' }, text: '2' },
        ],
      },
      { richText: [{ font: { italic: true, underline: true }, text: 'both' }] },
      { richText: [{ font: { bold: true }, text: 'A' }] },
      {
        richText: [{ font: { bold: true }, text: 'Because' }, { text: ' so' }],
      },
      { richText: [{ font: { bold: true }, text: 'EASY' }] },
    ]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('keeps the formatting of the text people read', async () => {
    const [q] = await parseQuestionSheet(await richSheet());
    expect(q.statement).toBe('Which is <strong>not</strong> CO<sub>2</sub>?');
    expect(q.options).toEqual([
      { key: 'A', text: 'x<sup>2</sup>' },
      { key: 'B', text: '<em><u>both</u></em>' },
    ]);
    expect(q.meta.explanation).toBe('<strong>Because</strong> so');
  });

  it('keeps formatting set on a whole cell, not only inside it', async () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Questions');
    ws.addRow(['statement', 'optionA', 'optionB', 'answer']);
    const row = ws.addRow(['All of this is bold', 'x', '2', 'A']);
    row.getCell(1).font = { bold: true };
    row.getCell(3).font = { vertAlign: 'superscript' };
    row.getCell(4).font = { bold: true };

    const [q] = await parseQuestionSheet(
      Buffer.from(await wb.xlsx.writeBuffer()),
    );
    expect(q.statement).toBe('<strong>All of this is bold</strong>');
    expect(q.options[1].text).toBe('<sup>2</sup>');
    expect(q.answer).toBe('A');
  });

  it('reduces the values a question is parsed from to plain text', async () => {
    const [q] = await parseQuestionSheet(await richSheet());
    expect(q.answer).toBe('A');
    expect(q.meta.difficulty).toBe('EASY');
  });

  it('finds a header row that is itself rich text', async () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Questions');
    ws.addRow([
      { richText: [{ font: { bold: true }, text: 'Statement' }] },
      { richText: [{ font: { bold: true }, text: 'Answer' }] },
    ]);
    ws.addRow(['One?', 'A']);
    const [q] = await parseQuestionSheet(
      Buffer.from(await wb.xlsx.writeBuffer()),
    );
    expect(q.statement).toBe('One?');
    expect(q.answer).toBe('A');
  });

  it('leaves other importers with the bare value', async () => {
    const rows = await sheetRecords(await richSheet(), {
      required: ['statement'],
    });
    expect(rows[0].data.statement).toBe('Which is not CO2?');
  });
});
