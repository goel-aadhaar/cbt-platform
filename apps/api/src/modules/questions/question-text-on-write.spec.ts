/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma */
import { BadRequestException } from '@nestjs/common';

import { Role } from '../auth/auth.types';
import { ParsedQuestion } from './ports/question-import.port';
import { QuestionsService } from './questions.service';

/**
 * What reaches the question table: one stored form, however the text arrived,
 * and never a statement that is only markup.
 */
describe('QuestionsService - question text on write', () => {
  type Row = Record<string, unknown>;

  function build(opts: { existing?: Row; parsed?: ParsedQuestion[] } = {}) {
    const tenant = {
      get: () => ({
        userId: 'user-1',
        role: Role.ADMIN,
        instituteId: 'inst-1',
        isSuperadmin: false,
      }),
    };
    const created: Row[] = [];
    const prisma = {
      subject: {
        findFirst: jest.fn(async () => ({ id: 'sub-1', name: 'Chemistry' })),
      },
      chapter: {
        findFirst: jest.fn(async () => ({ id: 'chap-1', name: 'Gases' })),
      },
      examCategory: { findFirst: jest.fn(async () => null) },
      media: { findMany: jest.fn(async () => []) },
      examQuestion: { findMany: jest.fn(async () => []) },
      question: {
        create: jest.fn(async ({ data }: { data: Row }) => {
          created.push(data);
          return { id: `q-${created.length}`, ...data };
        }),
        findFirst: jest.fn(async () => opts.existing ?? null),
        update: jest.fn(async ({ data }: { data: Row }) => ({
          ...opts.existing,
          ...data,
        })),
      },
    };
    const service = new QuestionsService(
      prisma as never,
      tenant as never,
      {} as never,
      { format: 'test', parse: jest.fn(async () => opts.parsed ?? []) },
      {
        start: jest.fn(async () => 'run-1'),
        finish: jest.fn(async () => undefined),
      } as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, created };
  }

  const dto = (statement: string) =>
    ({
      subjectId: 'sub-1',
      chapterId: 'chap-1',
      difficulty: 'EASY',
      type: 'MCQ',
      statement,
      options: [
        { key: 'A', text: 'H<sub>2</sub>O' },
        { key: 'B', text: 'Fe & Cu' },
      ],
      answerKey: 'A',
    }) as never;

  const existing = {
    id: 'q-1',
    instituteId: 'inst-1',
    status: 'DRAFT',
    createdById: 'user-1',
    type: 'MCQ',
    statement: 'Before',
    options: [
      { key: 'A', text: 'one' },
      { key: 'B', text: 'two' },
    ],
    answerKey: 'A',
    mediaKeys: [],
  };

  it.each([
    '<p></p>',
    '<br>',
    '<script>alert(1)</script>',
    '<strong> </strong>',
  ])('refuses %s as a statement on create', async (statement) => {
    const { service, created } = build();
    await expect(service.create(dto(statement))).rejects.toThrow(
      BadRequestException,
    );
    expect(created).toHaveLength(0);
  });

  describe('an unresolved Word equation', () => {
    const EQ = 'Solve [[EQ: x2+3x=0]] now';

    it('cannot be published by an admin saving a new question', async () => {
      const { service, created } = build();
      await expect(service.create(dto(EQ))).rejects.toThrow(
        BadRequestException,
      );
      expect(created).toHaveLength(0);
    });

    it('is refused in an option or the explanation too', async () => {
      const { service, created } = build();
      const withExplanation = {
        ...(dto('Fine') as object),
        explanation: 'See [[EQ: x]]',
      };
      await expect(service.create(withExplanation as never)).rejects.toThrow(
        BadRequestException,
      );
      expect(created).toHaveLength(0);
    });

    it('may stay in a draft while it is being fixed', async () => {
      const { service, created } = build();
      await service.create({
        ...(dto(EQ) as object),
        publish: false,
      } as never);
      expect(created[0]).toMatchObject({ status: 'DRAFT' });
    });

    it('cannot be added to an approved question by an edit', async () => {
      const { service, prisma } = build({
        existing: { ...existing, status: 'APPROVED', explanation: null },
      });
      await expect(service.update('q-1', { statement: EQ })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.question.update).not.toHaveBeenCalled();
    });

    it('can be edited into a draft', async () => {
      const { service, prisma } = build({
        existing: { ...existing, explanation: null },
      });
      await service.update('q-1', { statement: EQ });
      expect(prisma.question.update).toHaveBeenCalled();
    });
  });

  it('refuses a markup-only statement on edit', async () => {
    const { service, prisma } = build({ existing });
    await expect(
      service.update('q-1', { statement: '<p></p>' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.question.update).not.toHaveBeenCalled();
  });

  it('leaves the statement alone when an edit does not send one', async () => {
    const { service, prisma } = build({ existing });
    await service.update('q-1', { difficulty: 'HARD' } as never);
    const [{ data }] = prisma.question.update.mock.calls[0] as unknown as [
      { data: Row },
    ];
    expect(data.statement).toBeUndefined();
  });

  it('stores create and edit in the same form', async () => {
    const { service, prisma, created } = build({ existing });
    const statement = '<p>CO<sub>2</sub> &amp; <b>water</b></p>';
    await service.create(dto(statement));
    await service.update('q-1', { statement });
    const [{ data }] = prisma.question.update.mock.calls[0] as unknown as [
      { data: Row },
    ];
    expect(created[0].statement).toBe(
      'CO<sub>2</sub> &amp; <strong>water</strong>',
    );
    expect(data.statement).toBe(created[0].statement);
    expect(created[0].options).toEqual([
      { key: 'A', text: 'H<sub>2</sub>O' },
      { key: 'B', text: 'Fe &amp; Cu' },
    ]);
  });

  it('labels import results with words, not tags', async () => {
    const block = (statement: string, answer: string | null) => ({
      statement,
      options: [
        { key: 'A', text: 'x' },
        { key: 'B', text: 'y' },
      ],
      answer,
      meta: {},
      images: [],
    });
    const { service, created } = build({
      parsed: [
        block('<strong>CO</strong><sub>2</sub> &amp; gas', 'A'),
        block('H<sub>2</sub>O', null),
      ],
    });
    const res = await service.importQuestions(Buffer.from('x'), {
      subjectId: 'sub-1',
      chapterId: 'chap-1',
    });
    expect(created[0].statement).toBe(
      '<strong>CO</strong><sub>2</sub> &amp; gas',
    );
    expect(res.imported[0].statement).toBe('CO2 & gas');
    expect(res.failed[0].statement).toBe('H2O');
  });
});
