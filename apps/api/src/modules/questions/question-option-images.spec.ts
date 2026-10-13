/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma */
import { BadRequestException } from '@nestjs/common';

import { Role } from '../auth/auth.types';
import { ParsedQuestion } from './ports/question-import.port';
import { QuestionsService } from './questions.service';

/**
 * Images inside options: what the service stores, what it refuses, and when an
 * edit counts as changing how a question scores.
 */
describe('QuestionsService - option images', () => {
  const INSTITUTE = 'inst-1';
  const KEY_A = `${INSTITUTE}/aaaa.png`;
  const KEY_B = `${INSTITUTE}/bbbb.png`;
  const STEM_KEY = `${INSTITUTE}/stem.png`;

  type Row = Record<string, unknown>;

  function build(
    opts: {
      /** Media keys that exist in this institute as IMAGE rows. */
      media?: string[];
      existing?: Row;
      parsed?: ParsedQuestion[];
      affectedExams?: string[];
    } = {},
  ) {
    const tenant = {
      get: () => ({
        userId: 'user-1',
        role: Role.ADMIN,
        instituteId: INSTITUTE,
        isSuperadmin: false,
      }),
    };
    const media = new Set(opts.media ?? [KEY_A, KEY_B, STEM_KEY]);
    const created: Row[] = [];
    const mediaFindMany = jest.fn(
      async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in.filter((k) => media.has(k)).map((key) => ({ key })),
    );
    const prisma = {
      subject: {
        findFirst: jest.fn(async () => ({ id: 'sub-1', name: 'Physics' })),
      },
      chapter: {
        findFirst: jest.fn(async () => ({ id: 'chap-1', name: 'Motion' })),
      },
      examCategory: { findFirst: jest.fn(async () => null) },
      media: {
        findMany: mediaFindMany,
        create: jest.fn(async ({ data }: { data: { key: string } }) => {
          media.add(data.key);
          return data;
        }),
      },
      examQuestion: {
        findMany: jest.fn(async ({ where }: { where: { exam?: unknown } }) =>
          where.exam
            ? (opts.affectedExams ?? []).map((examId) => ({ examId }))
            : [],
        ),
      },
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
    const results = {
      evaluate: jest.fn(async () => ({ evaluated: 3 })),
    };
    const storage = {
      put: jest.fn(async ({ fileName }: { fileName: string }) => ({
        key: `${INSTITUTE}/${fileName}`,
      })),
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
      results as never,
      storage as never,
    );
    return { service, prisma, created, results, storage };
  }

  const dto = (over: Record<string, unknown>) =>
    ({
      subjectId: 'sub-1',
      chapterId: 'chap-1',
      difficulty: 'EASY',
      type: 'MCQ',
      statement: 'Which waveform?',
      answerKey: 'A',
      ...over,
    }) as never;

  const updateData = (prisma: { question: { update: jest.Mock } }): Row =>
    (prisma.question.update.mock.calls[0] as [{ data: Row }])[0].data;

  describe('create', () => {
    it('keeps mediaKey on an option and omits it when there is none', async () => {
      const { service, created } = build();
      await service.create(
        dto({
          options: [
            { key: 'A', text: '', mediaKey: KEY_A },
            { key: 'B', text: 'two', mediaKey: null },
          ],
        }),
      );
      expect(created[0].options).toEqual([
        { key: 'A', text: '', mediaKey: KEY_A },
        { key: 'B', text: 'two' },
      ]);
      expect(Object.keys((created[0].options as object[])[1])).not.toContain(
        'mediaKey',
      );
    });

    it('rejects an option that has neither text nor image, whatever the caller', async () => {
      const { service } = build();
      await expect(
        service.create(
          dto({
            options: [
              { key: 'A', text: '  ' },
              { key: 'B', text: 'two' },
            ],
          }),
        ),
      ).rejects.toThrow('Each option needs text or an image');
    });

    it('refuses an option image that is not in this institute, naming it', async () => {
      const { service, created } = build({ media: [KEY_A] });
      const foreign = 'other-inst/zzzz.png';
      const err = await service
        .create(
          dto({
            options: [
              { key: 'A', text: '', mediaKey: KEY_A },
              { key: 'B', text: '', mediaKey: foreign },
            ],
          }),
        )
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toContain(foreign);
      expect((err as Error).message).not.toContain(KEY_A);
      expect(created).toHaveLength(0);
    });

    it('refuses a stem image that does not exist, looking only at IMAGE rows of the caller institute', async () => {
      const { service, prisma } = build({ media: [] });
      await expect(
        service.create(
          dto({
            mediaKeys: [STEM_KEY],
            options: [
              { key: 'A', text: 'x' },
              { key: 'B', text: 'y' },
            ],
          }),
        ),
      ).rejects.toThrow(STEM_KEY);
      expect(prisma.media.findMany).toHaveBeenCalledWith({
        where: {
          instituteId: INSTITUTE,
          key: { in: [STEM_KEY] },
          kind: 'IMAGE',
        },
        select: { key: true },
      });
    });

    it('does not touch the media table when no images are involved', async () => {
      const { service, prisma } = build();
      await service.create(
        dto({
          options: [
            { key: 'A', text: 'x' },
            { key: 'B', text: 'y' },
          ],
        }),
      );
      expect(prisma.media.findMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const existing = {
      id: 'q-1',
      instituteId: INSTITUTE,
      status: 'DRAFT',
      createdById: 'user-1',
      type: 'MCQ',
      statement: 'Which waveform?',
      options: [
        { key: 'A', text: 'one' },
        { key: 'B', text: 'two' },
      ],
      answerKey: 'A',
      mediaKeys: [],
    };

    it('does not re-score when only an option image is added', async () => {
      const { service, results, prisma } = build({
        existing,
        affectedExams: ['exam-1'],
      });
      const out = await service.update('q-1', {
        options: [
          { key: 'A', text: 'one', mediaKey: KEY_A },
          { key: 'B', text: 'two' },
        ],
      });
      expect(results.evaluate).not.toHaveBeenCalled();
      expect(out.recalculated).toEqual([]);
      expect(updateData(prisma).options).toEqual([
        { key: 'A', text: 'one', mediaKey: KEY_A },
        { key: 'B', text: 'two' },
      ]);
    });

    it('does not re-score when an image replaces an option text', async () => {
      const { service, results } = build({
        existing,
        affectedExams: ['exam-1'],
      });
      await service.update('q-1', {
        options: [
          { key: 'A', text: '', mediaKey: KEY_A },
          { key: 'B', text: 'two' },
        ],
      });
      expect(results.evaluate).not.toHaveBeenCalled();
    });

    it('still re-scores when the option set itself changes', async () => {
      const { service, results } = build({
        existing,
        affectedExams: ['exam-1'],
      });
      const out = await service.update('q-1', {
        options: [
          { key: 'A', text: 'one' },
          { key: 'B', text: 'two' },
          { key: 'C', text: 'three' },
        ],
      });
      expect(results.evaluate).toHaveBeenCalledWith('exam-1', {
        preservePublished: true,
      });
      expect(out.recalculated).toEqual([{ examId: 'exam-1', evaluated: 3 }]);
    });

    it('still re-scores when the answer key changes', async () => {
      const { service, results } = build({
        existing,
        affectedExams: ['exam-1'],
      });
      await service.update('q-1', { answerKey: 'B' });
      expect(results.evaluate).toHaveBeenCalledTimes(1);
    });

    it('keeps the used-in-exams confirmation gate for an image-only edit', async () => {
      const { service, prisma } = build({ existing });
      prisma.examQuestion.findMany.mockResolvedValueOnce([
        { exam: { id: 'e1', title: 'Mock', status: 'PUBLISHED' } },
      ] as never);
      await expect(
        service.update('q-1', {
          options: [
            { key: 'A', text: 'one', mediaKey: KEY_A },
            { key: 'B', text: 'two' },
          ],
        }),
      ).rejects.toMatchObject({
        response: { error: 'QuestionUsedInExams' },
      });
      expect(prisma.question.update).not.toHaveBeenCalled();
    });

    it('rejects an update that points an option at a missing image', async () => {
      const { service, prisma } = build({ existing, media: [] });
      await expect(
        service.update('q-1', {
          options: [
            { key: 'A', text: '', mediaKey: KEY_A },
            { key: 'B', text: 'two' },
          ],
        }),
      ).rejects.toThrow(KEY_A);
      expect(prisma.question.update).not.toHaveBeenCalled();
    });

    it('drops the old option image when the new option list omits it', async () => {
      const { service, prisma } = build({
        existing: {
          ...existing,
          options: [
            { key: 'A', text: '', mediaKey: KEY_A },
            { key: 'B', text: 'two' },
          ],
        },
      });
      await service.update('q-1', {
        options: [
          { key: 'A', text: 'one' },
          { key: 'B', text: 'two' },
        ],
      });
      expect(updateData(prisma).options).toEqual([
        { key: 'A', text: 'one' },
        { key: 'B', text: 'two' },
      ]);
    });
  });

  describe('DOCX import with option images', () => {
    const image = (n: number) => ({
      token: `[[IMAGE:${n}]]`,
      contentType: 'image/png',
      buffer: Buffer.from([n]),
    });
    const parsed = (over: Partial<ParsedQuestion> = {}): ParsedQuestion => ({
      statement: 'Which waveform?',
      options: [
        { key: 'A', text: '', image: image(1) },
        { key: 'B', text: 'square wave' },
      ],
      answer: 'A',
      meta: {},
      images: [image(0)],
      sourceSeq: 1,
      sourceLabel: '1',
      ...over,
    });
    const defaults = { subjectId: 'sub-1', chapterId: 'chap-1' };

    it('stores each option image and attaches it as that option mediaKey', async () => {
      const { service, created, storage, prisma } = build({
        parsed: [parsed()],
      });
      const res = await service.importQuestions(
        Buffer.from('x'),
        defaults,
        'paper.docx',
      );

      expect(res.failed).toEqual([]);
      expect(storage.put).toHaveBeenCalledTimes(2);
      expect(prisma.media.create).toHaveBeenCalledTimes(2);
      expect(created[0].options).toEqual([
        { key: 'A', text: '', mediaKey: `${INSTITUTE}/paper-q1-option-a.png` },
        { key: 'B', text: 'square wave' },
      ]);
      // The stem image is unchanged.
      expect(created[0].mediaKeys).toEqual([`${INSTITUTE}/paper-q1-1.png`]);
      expect(res.imported[0].images).toBe(2);
    });

    it('fails an option left with no text and no image', async () => {
      const { service, created } = build({
        parsed: [
          parsed({
            options: [
              { key: 'A', text: '' },
              { key: 'B', text: 'x' },
            ],
            images: [],
          }),
        ],
      });
      const res = await service.importQuestions(Buffer.from('x'), defaults);
      expect(created).toHaveLength(0);
      expect(res.failed[0].reason).toContain(
        'Each option needs text or an image',
      );
    });
  });
});
