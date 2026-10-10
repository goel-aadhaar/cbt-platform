import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ExportFilterDto } from './dto/export-questions.dto';
import {
  CHAPTER_IDS_MAX,
  chapterIdFilter,
  QueryQuestionsDto,
} from './dto/query-questions.dto';
import { QuestionExportService } from './question-export.service';
import { QuestionsService } from './questions.service';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const UNIT = '33333333-3333-4333-8333-333333333333';

const parse = <T extends object>(cls: new () => T, plain: object) =>
  plainToInstance(cls, plain);

describe('chapterIds / unitId on QueryQuestionsDto', () => {
  it('accepts a comma-separated list', async () => {
    const dto = parse(QueryQuestionsDto, { chapterIds: `${A},${B}` });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.chapterIds).toEqual([A, B]);
  });

  it('accepts a repeated parameter (array)', async () => {
    const dto = parse(QueryQuestionsDto, { chapterIds: [A, B] });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.chapterIds).toEqual([A, B]);
  });

  it('accepts a single value and de-duplicates', async () => {
    const dto = parse(QueryQuestionsDto, { chapterIds: `${A},${A}` });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.chapterIds).toEqual([A]);
  });

  it('rejects an invalid uuid', async () => {
    const dto = parse(QueryQuestionsDto, { chapterIds: `${A},not-a-uuid` });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('chapterIds');
  });

  it(`rejects more than ${CHAPTER_IDS_MAX} ids`, async () => {
    const many = Array.from(
      { length: CHAPTER_IDS_MAX + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const errors = await validate(
      parse(QueryQuestionsDto, { chapterIds: many.join(',') }),
    );
    expect(errors.map((e) => e.property)).toContain('chapterIds');
  });

  it('validates unitId as a uuid', async () => {
    expect(await validate(parse(QueryQuestionsDto, { unitId: UNIT }))).toEqual(
      [],
    );
    const errors = await validate(parse(QueryQuestionsDto, { unitId: 'x' }));
    expect(errors.map((e) => e.property)).toContain('unitId');
  });

  it('accepts the literal "unassigned" unit', async () => {
    expect(
      await validate(parse(QueryQuestionsDto, { unitId: 'unassigned' })),
    ).toEqual([]);
  });

  it('mirrors the same fields on the export filter', async () => {
    const dto = parse(ExportFilterDto, {
      unitId: UNIT,
      chapterIds: `${A},${B}`,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.chapterIds).toEqual([A, B]);
  });
});

describe('chapterIdFilter', () => {
  it('is empty with neither', () => {
    expect(chapterIdFilter()).toEqual({});
    expect(chapterIdFilter(undefined, [])).toEqual({});
  });

  it('uses chapterId alone or chapterIds alone', () => {
    expect(chapterIdFilter(A)).toEqual({ chapterId: A });
    expect(chapterIdFilter(undefined, [A, B])).toEqual({
      chapterId: { in: [A, B] },
    });
  });

  it('intersects when both are given', () => {
    expect(chapterIdFilter(A, [A, B])).toEqual({ chapterId: A });
    expect(chapterIdFilter(A, [B])).toEqual({ chapterId: { in: [] } });
  });
});

describe('QuestionsService.findAll taxonomy filters', () => {
  function build() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const raw = {
      $executeRaw: jest.fn(),
      $transaction: jest.fn((ops: unknown[]) =>
        Promise.resolve(
          ops.length === 3 ? [undefined, [], 0] : [undefined, 0, 0, 0, 0, 0, 0],
        ),
      ),
      question: { findMany, count },
    };
    const tenant = {
      get: jest.fn(() => ({
        instituteId: 'inst-1',
        userId: 'u1',
        role: 'ADMIN',
      })),
    };
    const service = new QuestionsService(
      { raw } as never,
      tenant as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, findMany };
  }

  it('applies unitId through the chapter and chapterIds as an in-list', async () => {
    const { service, findMany } = build();
    await service.findAll({ unitId: UNIT, chapterIds: [A, B] });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          instituteId: 'inst-1',
          chapterRef: { unitId: UNIT },
          chapterId: { in: [A, B] },
        },
      }),
    );
  });

  it('filters to chapters with no unit for unitId=unassigned', async () => {
    const { service, findMany } = build();
    await service.findAll({ unitId: 'unassigned' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instituteId: 'inst-1', chapterRef: { unitId: null } },
      }),
    );
  });

  it('selects the derived unit with each question', async () => {
    const { service, findMany } = build();
    await service.findAll({});
    const call = findMany.mock.calls[0] as unknown as [
      { select: { chapterRef: unknown } },
    ];
    expect(call[0].select.chapterRef).toEqual({
      select: { unitId: true, unit: { select: { id: true, name: true } } },
    });
  });
});

describe('QuestionExportService filter parity', () => {
  it('applies unitId and chapterIds like the list endpoint', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(1);
    const service = new QuestionExportService(
      { question: { findMany, count } } as never,
      {
        get: jest.fn(() => ({ instituteId: 'inst-1', userId: 'u1' })),
      } as never,
    );
    await (
      service as unknown as {
        resolveQuestions: (
          ids: undefined,
          f: ExportFilterDto,
        ) => Promise<unknown>;
      }
    ).resolveQuestions(undefined, { unitId: UNIT, chapterIds: [A, B] });

    expect(count).toHaveBeenCalledWith({
      where: {
        instituteId: 'inst-1',
        chapterRef: { unitId: UNIT },
        chapterId: { in: [A, B] },
      },
    });
  });
});
