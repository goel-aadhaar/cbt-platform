import { BadRequestException } from '@nestjs/common';

import { ExamStatus } from './exam.types';
import { ExamsService } from './exams.service';

/**
 * Chapter-wise weightage service paths, against a mocked Prisma client. The
 * pure arithmetic is covered in blueprint.spec.ts; here we check the grouping,
 * the scoping and what is persisted on a section.
 */
describe('ExamsService - chapter weightage', () => {
  const INSTITUTE = 'inst-1';
  const SUBJECT = 'subj-bio';
  const OTHER_SUBJECT = 'subj-chem';
  const BP_CH1 = 'ch-physiology';
  const BP_CH2 = 'ch-genetics';
  const BP_CH3 = 'ch-empty';

  const chapters = [
    { id: BP_CH1, name: 'Human Physiology', subjectId: SUBJECT },
    { id: BP_CH2, name: 'Genetics', subjectId: SUBJECT },
    { id: BP_CH3, name: 'Ecology', subjectId: SUBJECT },
    { id: 'ch-chem', name: 'Acids', subjectId: OTHER_SUBJECT },
    { id: 'ch-phy-11', name: 'Kinematics', subjectId: 'subj-phy-11' },
    { id: 'ch-phy-12', name: 'Optics', subjectId: 'subj-phy-12' },
    { id: 'ch-phy-other', name: 'Optics', subjectId: 'subj-phy-other' },
  ];

  function build() {
    const questions = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        chapterId: BP_CH1,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `g${i}`,
        chapterId: BP_CH2,
      })),
    ];

    const prisma = {
      chapter: {
        findMany: jest.fn(({ where }) =>
          chapters.filter(
            (c) =>
              (!where.id?.in || where.id.in.includes(c.id)) &&
              (!where.subjectId || c.subjectId === where.subjectId),
          ),
        ),
      },
      subject: {
        findMany: jest.fn(({ where }) => {
          const name = String(where.name.equals).toLowerCase();
          if (name === 'biology') return [{ id: SUBJECT }];
          if (name === 'physics')
            return [{ id: 'subj-phy-11' }, { id: 'subj-phy-12' }];
          return [];
        }),
      },
      question: {
        groupBy: jest.fn(() => [
          { chapterId: BP_CH1, _count: { _all: 5 } },
          { chapterId: BP_CH2, _count: { _all: 2 } },
        ]),
        findMany: jest.fn(({ where }) => {
          const notIn: string[] = where.id?.notIn ?? [];
          if (where.id?.in) {
            return (where.id.in as string[]).map((id) => ({
              id,
              statement: 'x'.repeat(300),
              type: 'MCQ',
              difficulty: 'EASY',
              marks: 4,
              subject: 'Biology',
              chapter: 'c',
              topic: null,
            }));
          }
          return questions.filter(
            (q) =>
              where.chapterId.in.includes(q.chapterId) && !notIn.includes(q.id),
          );
        }),
      },
      examSection: {
        count: jest.fn(() => 0),
        create: jest.fn(({ data }) => ({ id: 'sec-1', ...data })),
        findFirst: jest.fn(() => ({
          id: 'sec-1',
          instituteId: INSTITUTE,
          name: 'Biology',
        })),
        update: jest.fn(({ data }) => ({ id: 'sec-1', ...data })),
      },
      exam: {
        findFirst: jest.fn(() => ({
          id: 'exam-1',
          instituteId: INSTITUTE,
          status: ExamStatus.DRAFT,
        })),
      },
    };
    const tenant = {
      get: jest.fn(() => ({
        instituteId: INSTITUTE,
        userId: 'u1',
        role: 'TEACHER',
      })),
    };
    const teacherScope = { myBatchIds: jest.fn(() => null) };
    const service = new ExamsService(
      prisma as never,
      tenant as never,
      teacherScope as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  const item = (chapterId: string, percent: number, count: number) => ({
    chapterId,
    percent,
    count,
  });

  describe('blueprintChapters', () => {
    it('lists active chapters with approved counts, zero included', async () => {
      const { service, prisma } = build();
      const out = await service.blueprintChapters(SUBJECT);
      expect(out).toEqual([
        { chapterId: BP_CH1, name: 'Human Physiology', approvedCount: 5 },
        { chapterId: BP_CH2, name: 'Genetics', approvedCount: 2 },
        { chapterId: BP_CH3, name: 'Ecology', approvedCount: 0 },
      ]);
      expect(prisma.question.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['chapterId'],
          where: {
            instituteId: INSTITUTE,
            subjectId: SUBJECT,
            status: 'APPROVED',
            isActive: true,
          },
        }),
      );
      expect(prisma.chapter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instituteId: INSTITUTE, subjectId: SUBJECT, isActive: true },
        }),
      );
    });
  });

  describe('pickByBlueprint', () => {
    it('picks per-chapter quotas, reports shortfalls and truncates statements', async () => {
      const { service } = build();
      const out = await service.pickByBlueprint({
        subjectId: SUBJECT,
        total: 10,
        items: [
          { chapterId: BP_CH1, percent: 40 },
          { chapterId: BP_CH2, percent: 60 },
        ],
        seed: 5,
      });
      expect(out.picks.filter((p) => p.chapterId === BP_CH1)).toHaveLength(4);
      expect(out.picks.filter((p) => p.chapterId === BP_CH2)).toHaveLength(2);
      expect(out.shortfalls).toEqual([
        { chapterId: BP_CH2, wanted: 6, available: 2 },
      ]);
      expect(out.counts[1]).toMatchObject({
        wanted: 6,
        picked: 2,
        available: 2,
      });
      expect(out.picks[0].question.statement.length).toBeLessThanOrEqual(203);
      expect(out.picks[0].chapter).toBe('Human Physiology');
    });

    it('never picks an excluded question', async () => {
      const { service } = build();
      const out = await service.pickByBlueprint({
        subjectId: SUBJECT,
        total: 4,
        items: [{ chapterId: BP_CH1, percent: 100 }],
        excludeQuestionIds: ['p0', 'p1'],
        seed: 1,
      });
      const ids = out.picks.map((p) => p.questionId);
      expect(ids).toHaveLength(3);
      expect(ids).not.toContain('p0');
      expect(ids).not.toContain('p1');
      expect(out.shortfalls).toEqual([
        { chapterId: BP_CH1, wanted: 4, available: 3 },
      ]);
    });

    it('rejects a chapter from another subject', async () => {
      const { service } = build();
      await expect(
        service.pickByBlueprint({
          subjectId: SUBJECT,
          total: 4,
          items: [
            { chapterId: BP_CH1, percent: 50 },
            { chapterId: 'ch-chem', percent: 50 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('labels blueprint chapters with their current names', async () => {
      const { service, prisma } = build();
      (prisma.exam.findFirst as jest.Mock).mockReturnValueOnce({
        id: 'exam-1',
        sections: [
          {
            id: 'sec-1',
            blueprint: {
              total: 10,
              items: [item(BP_CH1, 40, 4), item(BP_CH3, 60, 6)],
            },
            questions: [],
          },
          { id: 'sec-2', blueprint: null, questions: [] },
        ],
      });
      const out = await service.findOne('exam-1');
      expect(out.sections[0].blueprint).toEqual({
        total: 10,
        items: [
          {
            chapterId: BP_CH1,
            percent: 40,
            count: 4,
            chapter: 'Human Physiology',
          },
          { chapterId: BP_CH3, percent: 60, count: 6, chapter: 'Ecology' },
        ],
      });
      expect(out.sections[1].blueprint).toBeNull();
    });

    it('skips the chapter lookup when no section has a blueprint', async () => {
      const { service, prisma } = build();
      (prisma.exam.findFirst as jest.Mock).mockReturnValueOnce({
        id: 'exam-1',
        sections: [{ id: 'sec-1', blueprint: null, questions: [] }],
      });
      await service.findOne('exam-1');
      expect(prisma.chapter.findMany).not.toHaveBeenCalled();
    });
  });

  describe('section blueprint persistence', () => {
    const good = {
      total: 10,
      items: [item(BP_CH1, 40, 4), item(BP_CH2, 60, 6)],
    };

    it('stores the blueprint when a section is added', async () => {
      const { service, prisma } = build();
      await service.addSection('exam-1', { name: 'Biology', blueprint: good });
      const data = (prisma.examSection.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.blueprint).toEqual(good);
    });

    it('adds a section with no blueprint untouched', async () => {
      const { service, prisma } = build();
      await service.addSection('exam-1', { name: 'Biology' });
      const data = (prisma.examSection.create as jest.Mock).mock.calls[0][0]
        .data;
      expect('blueprint' in data).toBe(false);
    });

    it('rejects chapters from a different subject than the section', async () => {
      const { service, prisma } = build();
      await expect(
        service.addSection('exam-1', {
          name: 'Biology',
          blueprint: {
            total: 4,
            items: [item('ch-chem', 100, 4)],
          },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.examSection.create).not.toHaveBeenCalled();
    });

    it('rejects chapters that do not exist', async () => {
      const { service } = build();
      await expect(
        service.addSection('exam-1', {
          name: 'Biology',
          blueprint: { total: 4, items: [item('ch-nope', 100, 4)] },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a mixed-subject blueprint under a free-form section name', async () => {
      const { service } = build();
      await expect(
        service.addSection('exam-1', {
          name: 'Section A',
          blueprint: {
            total: 4,
            items: [item(BP_CH1, 50, 2), item('ch-chem', 50, 2)],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a section name shared by two subjects when the chapters sit in one of them', async () => {
      const { service, prisma } = build();
      await service.addSection('exam-1', {
        name: 'Physics',
        blueprint: { total: 4, items: [item('ch-phy-12', 100, 4)] },
      });
      expect(prisma.examSection.create).toHaveBeenCalled();
    });

    it('rejects same-name subjects when the chapters span both of them', async () => {
      const { service } = build();
      await expect(
        service.addSection('exam-1', {
          name: 'Physics',
          blueprint: {
            total: 4,
            items: [item('ch-phy-11', 50, 2), item('ch-phy-12', 50, 2)],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects same-name subjects when the chapters belong to neither', async () => {
      const { service } = build();
      await expect(
        service.addSection('exam-1', {
          name: 'Physics',
          blueprint: { total: 4, items: [item('ch-phy-other', 100, 4)] },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates, leaves alone, and clears the blueprint', async () => {
      const { service, prisma } = build();
      const update = prisma.examSection.update as jest.Mock;

      await service.updateSection('exam-1', 'sec-1', { blueprint: good });
      expect(update.mock.calls[0][0].data.blueprint).toEqual(good);

      await service.updateSection('exam-1', 'sec-1', { marksCorrect: 4 });
      expect(update.mock.calls[1][0].data.blueprint).toBeUndefined();

      await service.updateSection('exam-1', 'sec-1', { blueprint: null });
      const cleared = update.mock.calls[2][0].data.blueprint;
      expect(cleared).not.toBeUndefined();
      expect(cleared).not.toEqual(good);
    });
  });
});
