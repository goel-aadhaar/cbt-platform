import {
  BadRequestException,
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../auth/auth.types';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ExamKind, ExamStatus } from './exam.types';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

/**
 * Dropping a batch. The assessment builder calls this for a teacher, so the
 * route takes both roles and the service holds the line on which rows a
 * teacher may touch: their own draft assessment and nothing else.
 */
describe('Exams - dropping a batch', () => {
  const INSTITUTE = 'inst-1';
  const AUTHOR = 'teacher-author';
  const EXAM = 'exam-1';
  const BATCH = 'batch-1';

  function build(
    role: Role,
    row: { kind?: ExamKind; status?: ExamStatus; createdById?: string } = {},
  ) {
    const exam = {
      id: EXAM,
      instituteId: INSTITUTE,
      createdById: AUTHOR,
      kind: ExamKind.ASSESSMENT,
      status: ExamStatus.DRAFT,
      ...row,
    };
    const prisma = {
      exam: {
        findFirst: jest.fn(({ where }) =>
          !where.createdById || where.createdById === exam.createdById
            ? exam
            : null,
        ),
      },
      examBatch: { deleteMany: jest.fn(() => ({ count: 1 })) },
    };
    const tenant = {
      get: jest.fn(() => ({ instituteId: INSTITUTE, userId: AUTHOR, role })),
    };
    const service = new ExamsService(
      prisma as never,
      tenant as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  describe('role guard', () => {
    const guard = new RolesGuard(new Reflector());
    const sessionAs = (role: Role) =>
      ({
        // eslint-disable-next-line @typescript-eslint/unbound-method
        getHandler: () => ExamsController.prototype.unassignBatch,
        getClass: () => ExamsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as unknown as ExecutionContext;

    it.each([Role.ADMIN, Role.TEACHER])('lets a %s through', (role) => {
      expect(guard.canActivate(sessionAs(role))).toBe(true);
    });

    it('refuses a student', () => {
      expect(() => guard.canActivate(sessionAs(Role.STUDENT))).toThrow(
        ForbiddenException,
      );
    });
  });

  it('lets a teacher drop a batch from their own draft assessment', async () => {
    const { service, prisma } = build(Role.TEACHER);

    await expect(service.unassignBatch(EXAM, BATCH)).resolves.toEqual({
      id: EXAM,
      batchId: BATCH,
    });
    expect(prisma.examBatch.deleteMany).toHaveBeenCalledWith({
      where: { examId: EXAM, batchId: BATCH },
    });
  });

  it('refuses a teacher on a Mock Test', async () => {
    const { service, prisma } = build(Role.TEACHER, {
      kind: ExamKind.MOCK_TEST,
    });

    await expect(service.unassignBatch(EXAM, BATCH)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.examBatch.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a teacher on a published assessment', async () => {
    const { service, prisma } = build(Role.TEACHER, {
      status: ExamStatus.PUBLISHED,
    });

    await expect(service.unassignBatch(EXAM, BATCH)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.examBatch.deleteMany).not.toHaveBeenCalled();
  });

  it("hides a colleague's assessment from a teacher", async () => {
    const { service, prisma } = build(Role.TEACHER, {
      createdById: 'teacher-colleague',
    });

    await expect(service.unassignBatch(EXAM, BATCH)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.examBatch.deleteMany).not.toHaveBeenCalled();
  });

  it('still lets an admin drop a batch from a published Mock Test', async () => {
    const { service, prisma } = build(Role.ADMIN, {
      kind: ExamKind.MOCK_TEST,
      status: ExamStatus.PUBLISHED,
    });

    await service.unassignBatch(EXAM, BATCH);

    expect(prisma.examBatch.deleteMany).toHaveBeenCalledTimes(1);
  });
});
