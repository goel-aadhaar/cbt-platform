/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma */
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { Role } from '../auth/auth.types';
import { ParsedQuestion } from './ports/question-import.port';
import { QuestionsService } from './questions.service';

/**
 * The import -> review -> approve pipeline, with the database mocked: order and
 * numbering survive the sequential insert, every import lands as a DRAFT, and
 * nothing with an unresolved Word-equation placeholder can reach review.
 */
describe('QuestionsService - import, review and bulk approval', () => {
  const INSTITUTE = 'inst-1';

  function parsedQuestion(
    seq: number,
    over: Partial<ParsedQuestion> = {},
  ): ParsedQuestion {
    return {
      statement: `Question ${seq}?`,
      options: [
        { key: 'A', text: 'one' },
        { key: 'B', text: 'two' },
      ],
      answer: 'A',
      meta: {},
      images: [],
      sourceSeq: seq,
      sourceLabel: String(seq),
      ...over,
    };
  }

  function build(opts: { role?: Role; parsed?: ParsedQuestion[] } = {}) {
    const role = opts.role ?? Role.ADMIN;
    const tenant = {
      get: () => ({
        userId: 'user-1',
        role,
        instituteId: INSTITUTE,
        isSuperadmin: false,
      }),
    };

    const created: Record<string, unknown>[] = [];
    const rows = new Map<string, Record<string, unknown>>();
    const prisma = {
      subject: {
        findFirst: jest.fn(async () => ({ id: 'sub-1', name: 'Physics' })),
      },
      chapter: {
        findFirst: jest.fn(async () => ({ id: 'chap-1', name: 'Motion' })),
      },
      examCategory: { findFirst: jest.fn(async () => null) },
      examQuestion: { findMany: jest.fn(async () => []) },
      question: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `q-${created.length}`, ...data };
        }),
        findFirst: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            rows.get(where.id) ?? null,
        ),
        findMany: jest.fn(
          async ({ where }: { where: { id?: { in: string[] } } }) =>
            [...rows.values()].filter(
              (r) => !where.id || where.id.in.includes(r.id as string),
            ),
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const next = { ...rows.get(where.id), ...data };
            rows.set(where.id, next);
            return next;
          },
        ),
      },
      raw: {
        $executeRaw: jest.fn(() => 'set-config'),
        $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
        question: {
          findMany: jest.fn().mockResolvedValue([]) as jest.Mock<
            Promise<unknown[]>,
            [unknown?]
          >,
          count: jest.fn(async () => 0),
        },
      },
    };
    const imports = {
      start: jest.fn(async () => 'run-1'),
      finish: jest.fn(async () => undefined),
    };
    const importer = {
      format: 'test',
      parse: jest.fn(async () => opts.parsed ?? []),
    };

    const service = new QuestionsService(
      prisma as never,
      tenant as never,
      {} as never,
      importer,
      imports as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, imports, created, rows };
  }

  const defaults = { subjectId: 'sub-1', chapterId: 'chap-1' };

  function seed(
    rows: Map<string, Record<string, unknown>>,
    id: string,
    over: Record<string, unknown> = {},
  ) {
    rows.set(id, {
      id,
      instituteId: INSTITUTE,
      status: 'DRAFT',
      createdById: 'user-1',
      type: 'MCQ',
      statement: 'Plain question?',
      options: [
        { key: 'A', text: 'one' },
        { key: 'B', text: 'two' },
      ],
      answerKey: 'A',
      explanation: null,
      ...over,
    });
  }

  describe('importQuestions', () => {
    it('inserts in file order, tagging every question with its run and number', async () => {
      const parsed = Array.from({ length: 12 }, (_, i) =>
        parsedQuestion(i + 1),
      );
      const { service, created, imports } = build({ parsed });

      const res = await service.importQuestions(
        Buffer.from('x'),
        defaults,
        'p.docx',
      );

      expect(imports.start).toHaveBeenCalledTimes(1);
      expect(res.importRunId).toBe('run-1');
      expect(created.map((c) => c.sourceSeq)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      expect(created.every((c) => c.importRunId === 'run-1')).toBe(true);
      expect(created[9]).toMatchObject({ sourceSeq: 10, sourceLabel: '10' });
      expect(res.imported.map((r) => r.sourceSeq)).toEqual(
        created.map((c) => c.sourceSeq),
      );
      expect(res.warnings).toEqual([]);
      expect(imports.finish).toHaveBeenCalledWith('run-1', {
        imported: 12,
        failures: [],
      });
    });

    it('lands an ADMIN upload as DRAFT, not APPROVED', async () => {
      const { service, created } = build({
        role: Role.ADMIN,
        parsed: [parsedQuestion(1)],
      });
      await service.importQuestions(Buffer.from('x'), defaults);
      expect(created[0].status).toBe('DRAFT');
    });

    it('lands a TEACHER upload as DRAFT too', async () => {
      const { service, created } = build({
        role: Role.TEACHER,
        parsed: [parsedQuestion(1)],
      });
      await service.importQuestions(Buffer.from('x'), defaults);
      expect(created[0].status).toBe('DRAFT');
    });

    it('lets a failing block keep its slot so later questions keep their numbers', async () => {
      const { service, created } = build({
        parsed: [
          parsedQuestion(1),
          parsedQuestion(2, { answer: null }),
          parsedQuestion(3),
        ],
      });
      const res = await service.importQuestions(Buffer.from('x'), defaults);

      expect(created.map((c) => c.sourceSeq)).toEqual([1, 3]);
      expect(res.failed).toHaveLength(1);
      expect(res.failed[0]).toMatchObject({
        sourceSeq: 2,
        sourceLabel: '2',
        reason: 'Missing answer',
      });
      expect(res.total).toBe(3);
    });

    it('warns when the file numbering jumps, but keeps file order', async () => {
      const { service, created } = build({
        parsed: [
          parsedQuestion(1),
          parsedQuestion(2),
          parsedQuestion(3, { sourceLabel: 'Q10' }),
        ],
      });
      const res = await service.importQuestions(Buffer.from('x'), defaults);
      expect(created.map((c) => c.sourceLabel)).toEqual(['1', '2', 'Q10']);
      expect(res.warnings).toEqual([
        'File numbering jumps: Q10 is item 3 in the file.',
      ]);
    });

    it('warns about an item skipped for having no text', async () => {
      const { service } = build({
        parsed: [parsedQuestion(1), parsedQuestion(3)],
      });
      const res = await service.importQuestions(Buffer.from('x'), defaults);
      expect(res.warnings[0]).toMatch(/Item 2 had no question text/);
    });

    it('creates strictly one at a time', async () => {
      const { service, prisma } = build({
        parsed: [parsedQuestion(1), parsedQuestion(2), parsedQuestion(3)],
      });
      let running = 0;
      let maxRunning = 0;
      const original = prisma.question.create.getMockImplementation()!;
      prisma.question.create.mockImplementation(async (args) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
        return original(args);
      });
      await service.importQuestions(Buffer.from('x'), defaults);
      expect(maxRunning).toBe(1);
    });
  });

  describe('formula placeholders', () => {
    it('refuses to submit a question that still has [[EQ ...]]', async () => {
      const { service, rows } = build();
      seed(rows, 'q1', { statement: 'Solve [[EQ: x2+3x=0]]' });
      await expect(service.submit('q1')).rejects.toThrow(BadRequestException);
      await expect(service.submit('q1')).rejects.toThrow(/\[\[EQ/);
    });

    it('also looks inside options and the explanation', async () => {
      const { service, rows } = build();
      seed(rows, 'q1', {
        options: [
          { key: 'A', text: '[[EQ: 1/2]]' },
          { key: 'B', text: 'two' },
        ],
      });
      seed(rows, 'q2', { explanation: 'Because [[EQ: a^2]]' });
      await expect(service.submit('q1')).rejects.toThrow(/formula/);
      await expect(service.submit('q2')).rejects.toThrow(/formula/);
    });

    it('refuses to approve one too', async () => {
      const { service, rows } = build();
      seed(rows, 'q1', { status: 'REVIEW', statement: '[[EQ: x]] ?' });
      await expect(service.approve('q1')).rejects.toThrow(/formula/);
    });

    it('lets it through once the placeholder is replaced', async () => {
      const { service, rows } = build();
      seed(rows, 'q1', { statement: 'Solve $x^2+3x=0$' });
      await expect(service.submit('q1')).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('sanitizes statement, options and explanation like create does', async () => {
      const { service, rows, prisma } = build();
      seed(rows, 'q1');
      await service.update('q1', {
        statement: 'Hi <script>alert(1)</script><b onclick="x()">bold</b>',
        options: [
          { key: 'A', text: '<img src=x onerror=alert(1)>one' },
          { key: 'B', text: 'two' },
        ],
        explanation: '<script>bad()</script>why',
      });

      const data = prisma.question.update.mock.calls[0][0].data;
      expect(data.statement).not.toContain('<script');
      expect(data.statement).not.toContain('onclick');
      expect(JSON.stringify(data.options)).not.toContain('onerror');
      expect(data.explanation).not.toContain('<script');
    });

    it('leaves fields it was not sent untouched', async () => {
      const { service, rows, prisma } = build();
      seed(rows, 'q1');
      await service.update('q1', { marks: 2 });
      const data = prisma.question.update.mock.calls[0][0].data;
      expect(data.statement).toBeUndefined();
      expect(data.options).toBeUndefined();
      expect(data.explanation).toBeUndefined();
    });
  });

  describe('bulkAction', () => {
    it('requires exactly one of importRunId / ids', async () => {
      const { service } = build();
      await expect(
        service.bulkAction({ action: 'approve' } as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.bulkAction({
          action: 'approve',
          importRunId: 'r',
          ids: ['a'],
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets an admin approve fresh drafts in one step, reporting each result', async () => {
      const { service, rows } = build();
      seed(rows, 'a', { sourceSeq: 1 });
      seed(rows, 'b', { sourceSeq: 2, statement: '[[EQ: x]]' });
      seed(rows, 'c', { sourceSeq: 3, status: 'REVIEW' });

      const res = await service.bulkAction({
        action: 'approve',
        ids: ['a', 'b', 'c'],
      });

      expect(res.ok).toBe(2);
      expect(res.failed).toBe(1);
      expect(res.results.find((r) => r.id === 'b')).toMatchObject({
        ok: false,
        error: expect.stringContaining('formula'),
      });
      expect(rows.get('a')?.status).toBe('APPROVED');
      expect(rows.get('b')?.status).toBe('DRAFT');
      expect(rows.get('c')?.status).toBe('APPROVED');
    });

    it('skips already-approved questions in a run but fails them when named', async () => {
      const { service, rows } = build();
      seed(rows, 'a', { status: 'APPROVED' });
      const named = await service.bulkAction({ action: 'approve', ids: ['a'] });
      expect(named.failed).toBe(1);

      const byRun = await service.bulkAction({
        action: 'approve',
        importRunId: '7d6ff0a6-5f0f-4a44-9d3b-0f2b6f0a1111',
      });
      expect(byRun).toMatchObject({ ok: 0, failed: 0, skipped: 1 });
    });

    it('reports an unknown id as a failure', async () => {
      const { service } = build();
      const res = await service.bulkAction({
        action: 'submit',
        ids: ['missing'],
      });
      expect(res.results).toEqual([
        { id: 'missing', ok: false, error: 'Question not found' },
      ]);
    });

    it('only lets a teacher submit', async () => {
      const { service, rows } = build({ role: Role.TEACHER });
      seed(rows, 'a');
      await expect(
        service.bulkAction({ action: 'approve', ids: ['a'] }),
      ).rejects.toThrow(ForbiddenException);
      const ok = await service.bulkAction({ action: 'submit', ids: ['a'] });
      expect(ok.ok).toBe(1);
      expect(rows.get('a')?.status).toBe('REVIEW');
    });

    it('refuses a teacher submitting a question written by someone else', async () => {
      const { service, rows } = build({ role: Role.TEACHER });
      seed(rows, 'a', { createdById: 'someone-else' });
      const res = await service.bulkAction({ action: 'submit', ids: ['a'] });
      expect(res).toMatchObject({ ok: 0, failed: 1 });
    });

    it('rejects only questions in review', async () => {
      const { service, rows } = build();
      seed(rows, 'a', { status: 'REVIEW' });
      seed(rows, 'b', { status: 'DRAFT' });
      const res = await service.bulkAction({
        action: 'reject',
        ids: ['a', 'b'],
      });
      expect(res.ok).toBe(1);
      expect(rows.get('a')?.status).toBe('REJECTED');
      expect(rows.get('b')?.status).toBe('DRAFT');
    });
  });

  describe('findAll ordering', () => {
    it('breaks createdAt ties by id', async () => {
      const { service, prisma } = build();
      await service.findAll({});
      expect(prisma.raw.question.findMany.mock.calls[0][0]).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    });

    it('lists an import run in source order, with review flags', async () => {
      const { service, prisma } = build();
      prisma.raw.question.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          type: 'MCQ',
          statement: 'Solve [[EQ: x]]',
          options: [{ key: 'A', text: 'one' }],
          answerKey: 'Z',
          explanation: null,
          sourceSeq: 3,
          sourceLabel: 'Q10',
        },
      ]);
      const res = await service.findAll({ importRunId: 'run-1' });

      const call = prisma.raw.question.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
      };
      expect(call.where.importRunId).toBe('run-1');
      expect(call.orderBy).toEqual([{ sourceSeq: 'asc' }, { id: 'asc' }]);
      expect((res.items[0] as { flags: string[] }).flags).toEqual([
        'formula',
        'answer',
        'label',
      ]);
    });
  });
});
