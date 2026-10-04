import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { EXPORT_IDS_MAX, ExportStudentsDto } from './export-students.dto';
import { QueryStudentsDto, STUDENT_IDS_MAX } from './query-students.dto';

/**
 * Mirrors the global ValidationPipe (transform + implicit conversion) so the
 * query string is parsed the way a real request would be.
 */
async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(QueryStudentsDto, query, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

describe('QueryStudentsDto.ids', () => {
  it('is absent when not sent', async () => {
    const { dto, errors } = await parse({ limit: '50' });
    expect(errors).toEqual([]);
    expect(dto.ids).toBeUndefined();
  });

  it('splits a comma-separated string into an array', async () => {
    const { dto, errors } = await parse({ ids: `${uuid(1)},${uuid(2)}` });
    expect(errors).toEqual([]);
    expect(dto.ids).toEqual([uuid(1), uuid(2)]);
  });

  it('accepts a single id', async () => {
    const { dto, errors } = await parse({ ids: uuid(7) });
    expect(errors).toEqual([]);
    expect(dto.ids).toEqual([uuid(7)]);
  });

  it('accepts a repeated parameter, including comma-joined entries', async () => {
    const { dto, errors } = await parse({
      ids: [uuid(1), `${uuid(2)},${uuid(3)}`],
    });
    expect(errors).toEqual([]);
    expect(dto.ids).toEqual([uuid(1), uuid(2), uuid(3)]);
  });

  it('trims whitespace, drops empty entries and de-duplicates', async () => {
    const { dto, errors } = await parse({
      ids: ` ${uuid(1)} ,,${uuid(1)}, ${uuid(2)}`,
    });
    expect(errors).toEqual([]);
    expect(dto.ids).toEqual([uuid(1), uuid(2)]);
  });

  it('rejects a value that is not a UUID', async () => {
    const { errors } = await parse({ ids: `${uuid(1)},not-a-uuid` });
    expect(errors.map((e) => e.property)).toEqual(['ids']);
  });

  it('rejects an empty list rather than treating it as "no filter"', async () => {
    const { errors } = await parse({ ids: '' });
    expect(errors.map((e) => e.property)).toEqual(['ids']);
  });

  it(`accepts exactly ${STUDENT_IDS_MAX} ids`, async () => {
    const ids = Array.from({ length: STUDENT_IDS_MAX }, (_, i) => uuid(i + 1));
    const { dto, errors } = await parse({ ids: ids.join(',') });
    expect(errors).toEqual([]);
    expect(dto.ids).toHaveLength(STUDENT_IDS_MAX);
  });

  it(`rejects more than ${STUDENT_IDS_MAX} ids`, async () => {
    const ids = Array.from({ length: STUDENT_IDS_MAX + 1 }, (_, i) =>
      uuid(i + 1),
    );
    const { errors } = await parse({ ids: ids.join(',') });
    expect(errors.map((e) => e.property)).toEqual(['ids']);
  });

  it('rejects a non-string payload', async () => {
    const { errors } = await parse({ ids: { a: 1 } });
    expect(errors.map((e) => e.property)).toEqual(['ids']);
  });
});

describe('ExportStudentsDto', () => {
  async function parseExport(input: Record<string, unknown>) {
    const dto = plainToInstance(ExportStudentsDto, input, {
      enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  it('takes the roster filters without paging', async () => {
    const { dto, errors } = await parseExport({
      search: 'aar',
      status: 'ACTIVE',
      sort: 'name_asc',
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ search: 'aar', status: 'ACTIVE' });
    const paged = await parseExport({ limit: '10', offset: '0' });
    expect(paged.errors.map((e) => e.property).sort()).toEqual([
      'limit',
      'offset',
    ]);
  });

  it(`accepts up to ${EXPORT_IDS_MAX} ids, as a string or an array`, async () => {
    const ids = Array.from({ length: EXPORT_IDS_MAX }, (_, i) => uuid(i + 1));
    const asString = await parseExport({ ids: ids.join(',') });
    expect(asString.errors).toEqual([]);
    expect(asString.dto.ids).toHaveLength(EXPORT_IDS_MAX);
    const asArray = await parseExport({ ids });
    expect(asArray.errors).toEqual([]);
    expect(asArray.dto.ids).toEqual(ids);
  });

  it(`rejects more than ${EXPORT_IDS_MAX} ids, or a bad id`, async () => {
    const ids = Array.from({ length: EXPORT_IDS_MAX + 1 }, (_, i) =>
      uuid(i + 1),
    );
    expect((await parseExport({ ids })).errors.map((e) => e.property)).toEqual([
      'ids',
    ]);
    expect(
      (await parseExport({ ids: [uuid(1), 'x'] })).errors.map(
        (e) => e.property,
      ),
    ).toEqual(['ids']);
  });

  it.each([
    ['true', true],
    ['1', true],
    [true, true],
    ['false', false],
    ['0', false],
    [false, false],
  ])('includeResults %p → %p', async (raw, expected) => {
    const { dto, errors } = await parseExport({ includeResults: raw });
    expect(errors).toEqual([]);
    expect(dto.includeResults).toBe(expected);
  });

  it('rejects an unrecognised includeResults, and leaves it unset by default', async () => {
    const bad = await parseExport({ includeResults: 'yes' });
    expect(bad.errors.map((e) => e.property)).toEqual(['includeResults']);
    const none = await parseExport({});
    expect(none.errors).toEqual([]);
    expect(none.dto.includeResults).toBeUndefined();
  });
});
