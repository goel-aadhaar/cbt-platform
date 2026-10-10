import { BadRequestException, ValidationPipe } from '@nestjs/common';

import {
  largestRemainderCounts,
  planBlueprintPick,
  seededRandom,
  shuffled,
} from './blueprint';
import { BlueprintPickDto, SectionBlueprintDto } from './dto/blueprint.dto';
import { CreateSectionDto, UpdateSectionDto } from './dto/exam-parts.dto';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('largestRemainderCounts', () => {
  it('splits 7 questions at 40/20/40 and still totals 7', () => {
    const counts = largestRemainderCounts(7, [40, 20, 40]);
    expect(sum(counts)).toBe(7);
    // quotas 2.8 / 1.4 / 2.8 -> floors 2/1/2, two leftovers go to the .8s
    expect(counts).toEqual([3, 1, 3]);
  });

  it('splits three equal 33.33 chapters exactly', () => {
    const counts = largestRemainderCounts(10, [33.33, 33.33, 33.33]);
    expect(sum(counts)).toBe(10);
    expect(counts).toEqual([4, 3, 3]);
  });

  it('handles a single question', () => {
    expect(largestRemainderCounts(1, [60, 40])).toEqual([1, 0]);
    expect(largestRemainderCounts(1, [100])).toEqual([1]);
  });

  it('is exact for clean percentages', () => {
    expect(largestRemainderCounts(50, [40, 20, 40])).toEqual([20, 10, 20]);
  });

  it('gives zero percent chapters nothing', () => {
    expect(largestRemainderCounts(5, [0, 100, 0])).toEqual([0, 5, 0]);
  });

  it.each([1, 2, 3, 7, 13, 45, 90, 300])(
    'always totals %i for awkward percents',
    (total) => {
      const counts = largestRemainderCounts(total, [17.5, 22.5, 12.5, 47.5]);
      expect(sum(counts)).toBe(total);
      expect(counts.every((c) => Number.isInteger(c) && c >= 0)).toBe(true);
    },
  );

  it('returns zeros when there is nothing to split', () => {
    expect(largestRemainderCounts(0, [50, 50])).toEqual([0, 0]);
    expect(largestRemainderCounts(5, [])).toEqual([]);
  });
});

describe('shuffled / seededRandom', () => {
  it('is deterministic for a seed and does not mutate the input', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffled(input, seededRandom(42));
    const b = shuffled(input, seededRandom(42));
    expect(a).toEqual(b);
    expect(input).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect([...a].sort((x, y) => x - y)).toEqual(input);
  });

  it('differs between seeds', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffled(input, seededRandom(1))).not.toEqual(
      shuffled(input, seededRandom(2)),
    );
  });
});

describe('planBlueprintPick', () => {
  const pool = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  it('picks each chapter quota from its own pool', () => {
    const plan = planBlueprintPick(
      10,
      [
        { chapterId: 'phys', percent: 40 },
        { chapterId: 'gen', percent: 60 },
      ],
      new Map([
        ['phys', pool(20, 'p')],
        ['gen', pool(20, 'g')],
      ]),
      seededRandom(7),
    );
    expect(plan.shortfalls).toEqual([]);
    expect(plan.picked[0].questionIds).toHaveLength(4);
    expect(plan.picked[1].questionIds).toHaveLength(6);
    expect(plan.picked[0].questionIds.every((q) => q.startsWith('p'))).toBe(
      true,
    );
    expect(new Set(plan.picked.flatMap((p) => p.questionIds)).size).toBe(10);
  });

  it('reports a shortfall instead of redistributing', () => {
    const plan = planBlueprintPick(
      10,
      [
        { chapterId: 'phys', percent: 40 },
        { chapterId: 'gen', percent: 60 },
      ],
      new Map([
        ['phys', pool(20, 'p')],
        ['gen', pool(2, 'g')],
      ]),
      seededRandom(7),
    );
    expect(plan.shortfalls).toEqual([
      { chapterId: 'gen', wanted: 6, available: 2 },
    ]);
    expect(plan.picked[1].questionIds).toHaveLength(2);
    expect(plan.picked[0].questionIds).toHaveLength(4);
    expect(plan.counts[1]).toEqual({
      chapterId: 'gen',
      percent: 60,
      wanted: 6,
      picked: 2,
      available: 2,
    });
  });

  it('treats a chapter with no questions as a full shortfall', () => {
    const plan = planBlueprintPick(
      4,
      [{ chapterId: 'empty', percent: 100 }],
      new Map(),
    );
    expect(plan.picked[0].questionIds).toEqual([]);
    expect(plan.shortfalls).toEqual([
      { chapterId: 'empty', wanted: 4, available: 0 },
    ]);
  });

  it('is reproducible with a seed', () => {
    const items = [{ chapterId: 'a', percent: 100 }];
    const candidates = new Map([['a', pool(30, 'q')]]);
    const one = planBlueprintPick(5, items, candidates, seededRandom(99));
    const two = planBlueprintPick(5, items, candidates, seededRandom(99));
    expect(one.picked).toEqual(two.picked);
  });
});

describe('weightage DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const C1 = '11111111-1111-4111-8111-111111111111';
  const C2 = '22222222-2222-4222-8222-222222222222';
  const SUBJECT = '33333333-3333-4333-8333-333333333333';

  async function messages(
    metatype: new () => object,
    body: Record<string, unknown>,
  ): Promise<string[]> {
    try {
      await pipe.transform(body, { type: 'body', metatype });
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res = (err as BadRequestException).getResponse() as {
        message: string[];
      };
      return res.message;
    }
    return [];
  }

  it('accepts a pick that sums to 100', async () => {
    expect(
      await messages(BlueprintPickDto, {
        subjectId: SUBJECT,
        total: 20,
        items: [
          { chapterId: C1, percent: 40 },
          { chapterId: C2, percent: 60 },
        ],
      }),
    ).toEqual([]);
  });

  it('accepts three 33.33 chapters (within a hundredth of 100)', async () => {
    const C3 = '44444444-4444-4444-8444-444444444444';
    expect(
      await messages(BlueprintPickDto, {
        subjectId: SUBJECT,
        total: 10,
        items: [
          { chapterId: C1, percent: 33.33 },
          { chapterId: C2, percent: 33.33 },
          { chapterId: C3, percent: 33.34 },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects percents that do not sum to 100', async () => {
    const msgs = await messages(BlueprintPickDto, {
      subjectId: SUBJECT,
      total: 20,
      items: [
        { chapterId: C1, percent: 40 },
        { chapterId: C2, percent: 50 },
      ],
    });
    expect(msgs.join(' ')).toMatch(/add up to 100/);
  });

  it('rejects a duplicate chapter', async () => {
    const msgs = await messages(BlueprintPickDto, {
      subjectId: SUBJECT,
      total: 20,
      items: [
        { chapterId: C1, percent: 50 },
        { chapterId: C1, percent: 50 },
      ],
    });
    expect(msgs.join(' ')).toMatch(/only once/);
  });

  it('rejects out-of-range totals and empty items', async () => {
    expect(
      (
        await messages(BlueprintPickDto, {
          subjectId: SUBJECT,
          total: 301,
          items: [{ chapterId: C1, percent: 100 }],
        })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await messages(BlueprintPickDto, {
          subjectId: SUBJECT,
          total: 10,
          items: [],
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  it('validates the section blueprint the same way', async () => {
    expect(
      await messages(SectionBlueprintDto, {
        total: 10,
        items: [
          { chapterId: C1, percent: 40, count: 4 },
          { chapterId: C2, percent: 60, count: 6 },
        ],
      }),
    ).toEqual([]);
    expect(
      (
        await messages(SectionBlueprintDto, {
          total: 10,
          items: [{ chapterId: C1, percent: 40, count: 4 }],
        })
      ).join(' '),
    ).toMatch(/add up to 100/);
  });

  it('lets a section carry, omit or clear a blueprint', async () => {
    const bp = {
      total: 10,
      items: [{ chapterId: C1, percent: 100, count: 10 }],
    };
    expect(
      await messages(CreateSectionDto, { name: 'Biology', blueprint: bp }),
    ).toEqual([]);
    expect(await messages(CreateSectionDto, { name: 'Biology' })).toEqual([]);
    expect(await messages(UpdateSectionDto, { blueprint: null })).toEqual([]);
    expect(
      (await messages(UpdateSectionDto, { blueprint: { total: 0, items: [] } }))
        .length,
    ).toBeGreaterThan(0);
  });
});
