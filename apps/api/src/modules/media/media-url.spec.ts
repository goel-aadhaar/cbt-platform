/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma */
import { AttemptsService } from '../attempts/attempts.service';
import { PracticeService } from '../practice/practice.service';
import { ResultsService } from '../results/results.service';
import { mediaUrl, withOptionMediaUrls } from './media-url';

const KEY = 'inst-1/option-b.png';

const local = { publicUrl: () => null };
const cdn = { publicUrl: (k: string) => `https://cdn.example/${k}` };

const options = [
  { key: 'A', text: 'sine' },
  { key: 'B', text: '', mediaKey: KEY },
];

describe('option image URLs for students', () => {
  it('resolves like a stem image: API route without a CDN, CDN URL with one', () => {
    expect(mediaUrl(local as never, KEY)).toBe(
      `/media/file/${encodeURIComponent(KEY)}`,
    );
    expect(withOptionMediaUrls(local as never, options)).toEqual([
      { key: 'A', text: 'sine' },
      {
        key: 'B',
        text: '',
        mediaKey: KEY,
        mediaUrl: `/media/file/${encodeURIComponent(KEY)}`,
      },
    ]);
    expect(withOptionMediaUrls(cdn as never, options)[1]).toMatchObject({
      mediaKey: KEY,
      mediaUrl: `https://cdn.example/${KEY}`,
    });
  });

  it('adds nothing to options without an image and passes other values through', () => {
    const publicUrl = jest.fn(() => null);
    const out = withOptionMediaUrls({ publicUrl } as never, [
      { key: 'A', text: 'x' },
    ]);
    expect(out).toEqual([{ key: 'A', text: 'x' }]);
    expect(publicUrl).not.toHaveBeenCalled();
    expect(withOptionMediaUrls(local as never, null)).toBeNull();
  });

  it('exam attempt state carries mediaUrl on option images, and the stem media as before', () => {
    const service = new AttemptsService(
      {} as never,
      {} as never,
      cdn as never,
      {} as never,
    );
    const state = (
      service as unknown as {
        shapeState: (a: unknown) => {
          exam: {
            sections: {
              questions: {
                question: {
                  options: unknown;
                  media: unknown;
                  answerKey?: unknown;
                };
              }[];
            }[];
          };
        };
      }
    ).shapeState({
      expiresAt: new Date(Date.now() + 60_000),
      exam: {
        sections: [
          {
            questions: [
              {
                question: {
                  id: 'q-1',
                  options,
                  mediaKeys: ['inst-1/stem.png'],
                },
              },
            ],
          },
        ],
      },
    });
    const q = state.exam.sections[0].questions[0].question;
    expect(q.options).toEqual([
      { key: 'A', text: 'sine' },
      {
        key: 'B',
        text: '',
        mediaKey: KEY,
        mediaUrl: `https://cdn.example/${KEY}`,
      },
    ]);
    expect(q.media).toEqual([
      { key: 'inst-1/stem.png', url: 'https://cdn.example/inst-1/stem.png' },
    ]);
    expect(q.answerKey).toBeUndefined();
  });

  it('practice questions carry mediaUrl on option images', () => {
    const service = new PracticeService(
      {} as never,
      {} as never,
      local as never,
    );
    const out = (
      service as unknown as {
        withMedia: (q: unknown) => { options: unknown; media: unknown };
      }
    ).withMedia({ id: 'q-1', options, mediaKeys: [] });
    expect(out.options).toEqual([
      { key: 'A', text: 'sine' },
      {
        key: 'B',
        text: '',
        mediaKey: KEY,
        mediaUrl: `/media/file/${encodeURIComponent(KEY)}`,
      },
    ]);
  });
});

describe('result review option images', () => {
  const INSTITUTE = 'inst-1';

  function build() {
    const question = {
      id: 'q-1',
      type: 'MCQ',
      statement: 'Which waveform?',
      options,
      answerKey: 'B',
      explanation: 'Because.',
      subject: 'Physics',
      chapter: 'Waves',
      topic: null,
      difficulty: 'EASY',
      mediaKeys: [],
    };
    const prisma = {
      attempt: {
        findFirst: jest.fn(async () => ({
          id: 'att-1',
          examId: 'exam-1',
          startedAt: new Date(),
          submittedAt: new Date(),
          responses: [{ questionId: 'q-1', answer: 'B', status: 'ANSWERED' }],
        })),
      },
      student: {
        findUnique: jest.fn(async () => ({ id: 'stu-1', batchId: 'b-1' })),
      },
      result: {
        findFirst: jest.fn(async () => ({
          totalMarks: 4,
          correctCount: 1,
          incorrectCount: 0,
          unattemptedCount: 0,
        })),
      },
      exam: {
        findFirst: jest.fn(async () => ({
          title: 'Mock',
          durationMinutes: 60,
          passingMarks: 0,
          sections: [
            {
              id: 's1',
              name: 'Physics',
              marksCorrect: 4,
              marksWrong: 1,
              questions: [{ order: 1, scoring: 'NORMAL', question }],
            },
          ],
        })),
      },
      manualScore: { findMany: jest.fn(async () => []) },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: INSTITUTE, userId: 'u1' })),
      getInstituteId: jest.fn(() => INSTITUTE),
    };
    const service = new ResultsService(
      prisma as never,
      tenant as never,
      { myBatchIds: jest.fn(async () => null) } as never,
      cdn as never,
    );
    return { service };
  }

  it('returns mediaKey and a resolved mediaUrl for each option image', async () => {
    const { service } = build();
    const review = await service.getReviewForStudent('att-1');
    expect(review.questions[0].options).toEqual([
      { key: 'A', text: 'sine' },
      {
        key: 'B',
        text: '',
        mediaKey: KEY,
        mediaUrl: `https://cdn.example/${KEY}`,
      },
    ]);
    expect(review.questions[0].correctAnswer).toBe('B');
  });
});
