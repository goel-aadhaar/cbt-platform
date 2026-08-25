import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { PRE_START_ATTEMPT_STATUSES } from '../attempts/attempt.types';
import { TenantContextService } from '../auth/tenant/tenant-context.service';

/**
 * Aggregates for the admin landing page.
 *
 * Every figure here is counted from real rows. Where the platform genuinely
 * does not track something the old mock displayed — API uptime, S3 health,
 * "AI insights" — nothing is returned and the UI drops the card rather than
 * inventing a number.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.get()?.instituteId;
    if (!id) {
      throw new ForbiddenException('No institute in the current context');
    }
    return id;
  }

  async summary() {
    const instituteId = this.instituteId();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      students,
      activeStudents,
      questions,
      approvedQuestions,
      exams,
      liveExams,
      attemptsThisWeek,
      submittedThisWeek,
      pendingResults,
      upcoming,
      recentAttempts,
      dailyAttempts,
    ] = await Promise.all([
      this.prisma.student.count({ where: { instituteId } }),
      this.prisma.student.count({
        where: { instituteId, user: { status: 'ACTIVE' } },
      }),
      this.prisma.question.count({ where: { instituteId, isActive: true } }),
      this.prisma.question.count({
        where: { instituteId, isActive: true, status: 'APPROVED' },
      }),
      this.prisma.exam.count({ where: { instituteId } }),
      this.prisma.exam.count({
        where: {
          instituteId,
          status: 'PUBLISHED',
          startAt: { lte: now },
          endAt: { gt: now },
        },
      }),
      this.prisma.attempt.count({
        where: { instituteId, startedAt: { gte: weekAgo } },
      }),
      this.prisma.attempt.count({
        where: {
          instituteId,
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
          submittedAt: { gte: weekAgo },
        },
      }),
      // Submitted work with no published result — the admin's actual to-do.
      this.prisma.attempt.count({
        where: {
          instituteId,
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
          OR: [{ result: null }, { result: { published: false } }],
        },
      }),
      this.prisma.exam.findMany({
        where: {
          instituteId,
          status: { in: ['APPROVED', 'PUBLISHED'] },
          OR: [{ startAt: null }, { endAt: { gt: now } }],
        },
        orderBy: [{ startAt: 'asc' }],
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          startAt: true,
          endAt: true,
          durationMinutes: true,
          _count: { select: { questions: true, batches: true } },
        },
      }),
      this.prisma.attempt.findMany({
        // Excludes PENDING_APPROVAL/APPROVED/DENIED: their startedAt is null,
        // which Postgres sorts FIRST on a DESC order — an unfiltered query
        // here would bury real recent activity under waiting-room noise.
        where: { instituteId, status: { notIn: PRE_START_ATTEMPT_STATUSES } },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          exam: { select: { id: true, title: true } },
          student: {
            select: {
              rollNumber: true,
              user: { select: { name: true } },
            },
          },
          result: {
            select: { totalScore: true, maxScore: true, published: true },
          },
        },
      }),
      this.prisma.attempt.findMany({
        where: { instituteId, startedAt: { gte: weekAgo } },
        select: { startedAt: true },
      }),
    ]);

    /** Attempts per day for the last 7 days, oldest first. */
    const byDay = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const a of dailyAttempts) {
      // Non-null: the query above filters startedAt >= weekAgo, which a SQL
      // comparison can never satisfy for a null column.
      const key = a.startedAt!.toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    return {
      counts: {
        students,
        activeStudents,
        questions,
        approvedQuestions,
        exams,
        liveExams,
        attemptsThisWeek,
        submittedThisWeek,
        /** Submitted attempts still waiting on evaluation or publication. */
        pendingResults,
      },
      /** Last 7 days of attempt volume, for the activity chart. */
      activity: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      upcoming: upcoming.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        startAt: e.startAt,
        endAt: e.endAt,
        durationMinutes: e.durationMinutes,
        questionCount: e._count.questions,
        batchCount: e._count.batches,
      })),
      recentAttempts: recentAttempts.map((a) => ({
        id: a.id,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        exam: a.exam,
        studentName: a.student.user.name,
        rollNumber: a.student.rollNumber,
        // Withheld until published — the admin list mirrors what students see.
        score: a.result?.published
          ? { totalScore: a.result.totalScore, maxScore: a.result.maxScore }
          : null,
      })),
    };
  }
}
