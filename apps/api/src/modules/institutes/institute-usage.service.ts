import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { UserStatus } from '../auth/auth.types';

/**
 * What one tenant actually consumes (§2.14).
 *
 * The institutes table already shows record counts, which answers "how big is
 * this tenant" but not "what is it costing us and is it still alive". Storage
 * is the figure the table cannot show at all: media bytes are the one resource
 * a tenant can run up without the row counts moving much, and the one the
 * platform owner pays for directly.
 *
 * Everything here is counted from the database. Nothing is estimated, and a
 * tenant with no activity reports zeroes rather than being omitted.
 */

/** Rolling window for the "recent" figures, in days. */
const WINDOW_DAYS = 30;

export interface InstituteUsage {
  institute: {
    id: string;
    name: string;
    slug: string;
    code: string;
    isActive: boolean;
    createdAt: Date;
  };
  windowDays: number;
  students: {
    total: number;
    active: number;
    pending: number;
    disabled: number;
  };
  staff: { total: number; admins: number; teachers: number };
  content: { exams: number; examsInWindow: number; questions: number };
  activity: {
    attempts: number;
    attemptsInWindow: number;
    liveAttempts: number;
    /** When this tenant was last used at all, or null if never. */
    lastAttemptAt: Date | null;
  };
  storage: { mediaCount: number; mediaBytes: number };
}

@Injectable()
export class InstituteUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async forInstitute(id: string): Promise<InstituteUsage> {
    const institute = await this.prisma.institute.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!institute) throw new NotFoundException('No such institute');

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);

    const students = (status: UserStatus) =>
      this.prisma.student.count({
        where: { instituteId: id, user: { status } },
      });

    const [
      studentTotal,
      studentActive,
      studentPending,
      studentDisabled,
      admins,
      teachers,
      exams,
      examsInWindow,
      questions,
      attempts,
      attemptsInWindow,
      liveAttempts,
      lastAttempt,
      media,
    ] = await Promise.all([
      this.prisma.student.count({ where: { instituteId: id } }),
      students(UserStatus.ACTIVE),
      students(UserStatus.PENDING),
      students(UserStatus.DISABLED),
      this.prisma.user.count({
        where: { instituteId: id, roles: { has: 'ADMIN' } },
      }),
      this.prisma.user.count({
        where: { instituteId: id, roles: { has: 'TEACHER' } },
      }),
      this.prisma.exam.count({ where: { instituteId: id } }),
      this.prisma.exam.count({
        where: { instituteId: id, createdAt: { gte: since } },
      }),
      this.prisma.question.count({ where: { instituteId: id } }),
      this.prisma.attempt.count({ where: { instituteId: id } }),
      this.prisma.attempt.count({
        where: { instituteId: id, startedAt: { gte: since } },
      }),
      this.prisma.attempt.count({
        where: { instituteId: id, status: 'IN_PROGRESS' },
      }),
      this.prisma.attempt.findFirst({
        where: { instituteId: id },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
      // Summed in the database rather than by loading every row: a tenant with
      // thousands of diagrams should cost one query, not thousands of objects.
      this.prisma.media.aggregate({
        where: { instituteId: id },
        _count: { _all: true },
        _sum: { size: true },
      }),
    ]);

    return {
      institute,
      windowDays: WINDOW_DAYS,
      students: {
        total: studentTotal,
        active: studentActive,
        pending: studentPending,
        disabled: studentDisabled,
      },
      // An account can hold both roles, so the parts can exceed the total.
      // `total` is the count of distinct people, which is the useful number.
      staff: {
        total: await this.prisma.user.count({
          where: {
            instituteId: id,
            roles: { hasSome: ['ADMIN', 'TEACHER'] },
          },
        }),
        admins,
        teachers,
      },
      content: { exams, examsInWindow, questions },
      activity: {
        attempts,
        attemptsInWindow,
        liveAttempts,
        lastAttemptAt: lastAttempt?.startedAt ?? null,
      },
      storage: {
        mediaCount: media._count._all,
        // `_sum` is null when there are no rows at all, not zero.
        mediaBytes: media._sum.size ?? 0,
      },
    };
  }
}
