/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma */
import { ConflictException, NotFoundException } from '@nestjs/common';

import { Role } from '../auth/auth.types';
import { MediaService } from './media.service';

const INSTITUTE = 'inst-1';
const KEY = `${INSTITUTE}/option-b.png`;

type Row = Record<string, unknown>;

function build(
  opts: {
    role?: Role;
    /** What the entitlement query for questions returns. */
    entitledQuestion?: boolean;
    questions?: Row[];
  } = {},
) {
  const tenant = {
    get: () => ({
      userId: 'user-1',
      role: opts.role ?? Role.STUDENT,
      instituteId: INSTITUTE,
      isSuperadmin: false,
    }),
  };
  const prisma = {
    media: {
      findFirst: jest.fn(async () => ({
        id: 'media-1',
        key: KEY,
        mimeType: 'image/png',
        fileName: 'answer-B.png',
        kind: 'IMAGE',
      })),
      delete: jest.fn(async () => undefined),
    },
    institute: { findFirst: jest.fn(async () => null) },
    student: {
      findUnique: jest.fn(async () => ({ id: 'stu-1', batchId: 'batch-1' })),
    },
    question: {
      findFirst: jest.fn(async () =>
        opts.entitledQuestion ? { id: 'q-1' } : null,
      ),
      findMany: jest.fn(async () => opts.questions ?? []),
      update: jest.fn(async () => undefined),
    },
    announcement: { findFirst: jest.fn(async () => null) },
    resource: { findFirst: jest.fn(async () => null) },
  };
  const storage = {
    name: 'fake',
    get: jest.fn(async () => Buffer.from('png-bytes')),
    remove: jest.fn(async () => undefined),
    publicUrl: jest.fn(() => null),
  };
  const service = new MediaService(
    prisma as never,
    tenant as never,
    storage as never,
  );
  return { service, prisma, storage };
}

describe('MediaService - student access to option images', () => {
  it('asks for the key as a stem image OR an option image, within an entitlement', async () => {
    const { service, prisma } = build({ entitledQuestion: true });
    await expect(service.read(KEY)).resolves.toMatchObject({ key: KEY });

    const where = (
      prisma.question.findFirst.mock.calls[0] as unknown as [
        { where: { instituteId: string; AND: { OR: unknown[] }[] } },
      ]
    )[0].where;
    expect(where.instituteId).toBe(INSTITUTE);
    const [keyMatch, entitlement] = where.AND;
    expect(keyMatch.OR).toEqual([
      { mediaKeys: { has: KEY } },
      { options: { array_contains: [{ mediaKey: KEY }] } },
    ]);
    // Same two conditions as for a stem image: a DPP assigned to the student's
    // own batch, or a response on one of their own attempts. Nothing wider.
    expect(entitlement.OR).toEqual([
      {
        dppQuestions: {
          some: { dpp: { batches: { some: { batchId: 'batch-1' } } } },
        },
      },
      { responses: { some: { attempt: { studentId: 'stu-1' } } } },
    ]);
  });

  it('serves an option image to an entitled student', async () => {
    const { service, storage } = build({ entitledQuestion: true });
    const file = await service.read(KEY);
    expect(file.body).toEqual(Buffer.from('png-bytes'));
    expect(storage.get).toHaveBeenCalledWith(KEY);
  });

  it('answers 404 (not 403) for a student with no entitlement', async () => {
    const { service, storage } = build({ entitledQuestion: false });
    await expect(service.read(KEY)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('lets staff read any image of their institute without the entitlement query', async () => {
    const { service, prisma } = build({ role: Role.TEACHER });
    await expect(service.read(KEY)).resolves.toBeDefined();
    expect(prisma.question.findFirst).not.toHaveBeenCalled();
  });
});

describe('MediaService.remove - option images', () => {
  const usedBy = [
    {
      id: 'q-1',
      statement: 'Which waveform?',
      status: 'APPROVED',
      mediaKeys: [`${INSTITUTE}/stem.png`, KEY],
      options: [
        { key: 'A', text: 'sine' },
        { key: 'B', text: '', mediaKey: KEY },
      ],
    },
    {
      id: 'q-2',
      statement: 'Pick the circuit',
      status: 'DRAFT',
      mediaKeys: [],
      options: [
        { key: 'A', text: '', mediaKey: KEY },
        { key: 'B', text: '', mediaKey: `${INSTITUTE}/other.png` },
      ],
    },
  ];

  it('looks for the key in stem images and in options', async () => {
    const { service, prisma } = build({ role: Role.ADMIN });
    await service.remove('media-1', true);
    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          instituteId: INSTITUTE,
          OR: [
            { mediaKeys: { has: KEY } },
            { options: { array_contains: [{ mediaKey: KEY }] } },
          ],
        },
      }),
    );
  });

  it('refuses with a 409 that counts the questions when options still use it', async () => {
    const { service, prisma, storage } = build({
      role: Role.ADMIN,
      questions: usedBy,
    });
    const err = await service.remove('media-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      error: 'MediaUsedInQuestions',
      affectedCount: 2,
      affectedQuestions: [
        { id: 'q-1', statement: 'Which waveform?', status: 'APPROVED' },
        { id: 'q-2', statement: 'Pick the circuit', status: 'DRAFT' },
      ],
    });
    expect(prisma.question.update).not.toHaveBeenCalled();
    expect(prisma.media.delete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('with confirm, strips the option mediaKey (and the stem key) before deleting', async () => {
    const { service, prisma, storage } = build({
      role: Role.ADMIN,
      questions: usedBy,
    });
    const out = await service.remove('media-1', true);

    expect(out).toEqual({
      id: 'media-1',
      deleted: true,
      detachedFromQuestions: 2,
    });
    expect(prisma.question.update).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      data: {
        mediaKeys: [`${INSTITUTE}/stem.png`],
        options: [
          { key: 'A', text: 'sine' },
          { key: 'B', text: '' },
        ],
      },
    });
    // Another image on the same question is left alone; the key is absent, not null.
    expect(prisma.question.update).toHaveBeenCalledWith({
      where: { id: 'q-2' },
      data: {
        mediaKeys: [],
        options: [
          { key: 'A', text: '' },
          { key: 'B', text: '', mediaKey: `${INSTITUTE}/other.png` },
        ],
      },
    });
    expect(prisma.media.delete).toHaveBeenCalledWith({
      where: { id: 'media-1' },
    });
    expect(storage.remove).toHaveBeenCalledWith(KEY);
  });

  it('deletes straight away when nothing uses the image', async () => {
    const { service, prisma } = build({ role: Role.ADMIN });
    const out = await service.remove('media-1');
    expect(out.detachedFromQuestions).toBe(0);
    expect(prisma.question.update).not.toHaveBeenCalled();
  });
});
