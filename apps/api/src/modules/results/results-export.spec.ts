import { Workbook } from 'exceljs';

import { parseCsv } from '../../common/csv/parse-csv';
import { ResultsService } from './results.service';

/**
 * Student names are typed by whoever filled in the import file, and an admin
 * opens these exports on their own machine. A name that is really a formula has
 * to arrive as text, while the marks beside it stay numbers.
 */
describe('result sheet exports', () => {
  const ATTACK = '=HYPERLINK("http://evil.test","Click")';

  function build() {
    const row = {
      overallRank: 1,
      batchRank: 1,
      totalScore: -5,
      maxScore: 100,
      correctCount: 1,
      incorrectCount: 3,
      unattemptedCount: 0,
      percentile: 12.5,
      published: true,
      batch: { name: '@Alpha' },
      student: {
        rollNumber: '2610000001',
        user: { name: ATTACK, email: 'a@b.io' },
      },
    };
    const prisma = {
      exam: {
        findFirst: jest.fn(() => ({
          id: 'e1',
          title: 'Paper',
          kind: 'MOCK_TEST',
        })),
      },
      result: { findMany: jest.fn(() => [row]) },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: 'inst-1', userId: 'u1' })),
      getInstituteId: jest.fn(() => 'inst-1'),
    };
    const teacherScope = { myBatchIds: jest.fn(() => Promise.resolve(null)) };
    return new ResultsService(
      prisma as never,
      tenant as never,
      teacherScope as never,
      {} as never, // MediaStoragePort — never called
    );
  }

  it('CSV: a formula in a name is text, and a negative score is a number', async () => {
    const { csv } = await build().exportResultsCsv('e1');
    const [headers, cells] = parseCsv(csv);
    expect(cells[headers.indexOf('Name')]).toBe(`'${ATTACK}`);
    expect(cells[headers.indexOf('Batch')]).toBe(`'@Alpha`);
    expect(cells[headers.indexOf('Score')]).toBe('-5');
    expect(cells[headers.indexOf('Email')]).toBe('a@b.io');
  });

  it('Excel: a formula in a name is text, and a negative score is a number', async () => {
    const { buffer } = await build().exportResultsXlsx('e1');
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.worksheets[0];
    const headers = ws.getRow(2).values as string[];
    const cell = (name: string) =>
      ws.getRow(3).getCell(headers.indexOf(name)).value;
    expect(cell('Name')).toBe(`'${ATTACK}`);
    expect(cell('Score')).toBe(-5);
    expect(cell('Rank')).toBe(1);
  });
});
