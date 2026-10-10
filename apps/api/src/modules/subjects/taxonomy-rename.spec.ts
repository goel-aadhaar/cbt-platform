import { ConflictException } from '@nestjs/common';

import { TopicsService } from '../topics/topics.service';
import { SubjectsService } from './subjects.service';

/**
 * Questions store subject/chapter/topic names as text (the search vector,
 * exports and review screens read them). A rename must carry them along, in
 * the same transaction, or the bank silently shows the old name. The chapter
 * case lives in chapters.service.spec.ts.
 */
describe('taxonomy rename resync', () => {
  const INSTITUTE = 'inst-1';
  const tenant = {
    getInstituteId: jest.fn(() => INSTITUTE),
    get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u1' })),
  };

  function txStub(model: 'subject' | 'topic', renamed: object) {
    return {
      $executeRaw: jest.fn(),
      [model]: { update: jest.fn().mockResolvedValue(renamed) },
      question: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
  }

  function rawOf(tx: object) {
    return {
      $executeRaw: jest.fn(),
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) =>
        Promise.resolve(cb(tx)),
      ),
    };
  }

  describe('subjects', () => {
    it('updates question.subject for the subject questions', async () => {
      const tx = txStub('subject', { id: 's1', name: 'Physics II' });
      const prisma = {
        subject: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 's1', name: 'Physics' })
            .mockResolvedValueOnce(null),
        },
        raw: rawOf(tx),
      };
      await new SubjectsService(prisma as never, tenant as never).update('s1', {
        name: 'Physics II',
      });
      expect(tx.question.updateMany).toHaveBeenCalledWith({
        where: { subjectId: 's1' },
        data: { subject: 'Physics II' },
      });
    });

    it('409s on a duplicate subject name', async () => {
      const tx = txStub('subject', {});
      const prisma = {
        subject: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 's1', name: 'Physics' })
            .mockResolvedValueOnce({ id: 's2', name: 'Chemistry' }),
        },
        raw: rawOf(tx),
      };
      await expect(
        new SubjectsService(prisma as never, tenant as never).update('s1', {
          name: 'Chemistry',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.question.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('topics', () => {
    it('updates question.topic for the topic questions', async () => {
      const tx = txStub('topic', { id: 't1', name: 'Vectors' });
      const prisma = {
        topic: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 't1',
              name: 'Scalars',
              chapterId: 'c1',
            })
            .mockResolvedValueOnce(null),
        },
        raw: rawOf(tx),
      };
      await new TopicsService(prisma as never, tenant as never).update('t1', {
        name: 'Vectors',
      });
      expect(tx.question.updateMany).toHaveBeenCalledWith({
        where: { topicId: 't1' },
        data: { topic: 'Vectors' },
      });
    });

    it('409s on a duplicate topic name within the chapter', async () => {
      const tx = txStub('topic', {});
      const prisma = {
        topic: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 't1',
              name: 'Scalars',
              chapterId: 'c1',
            })
            .mockResolvedValueOnce({ id: 't2', name: 'Vectors' }),
        },
        raw: rawOf(tx),
      };
      await expect(
        new TopicsService(prisma as never, tenant as never).update('t1', {
          name: 'Vectors',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
