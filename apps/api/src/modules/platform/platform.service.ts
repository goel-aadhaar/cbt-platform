import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { PRE_START_ATTEMPT_STATUSES } from '../attempts/attempt.types';
import { UserStatus } from '../auth/auth.types';
import { PlatformUsagePort } from './ports/platform-usage.port';

/**
 * Platform-wide figures for the superadmin dashboard.
 *
 * Deliberately cross-tenant — this is the one consumer that is supposed to see
 * every institute at once, and it is reachable only from @Roles(SUPERADMIN).
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: PlatformUsagePort,
  ) {}

  async overview() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    /**
     * A candidate's state lives on their User row, not the Student row, so the
     * breakdown is counted through the relation. PENDING and DISABLED are kept
     * apart rather than merged into one "inactive" figure: an invitation nobody
     * has accepted and an account somebody switched off are different problems
     * with different fixes, and a platform owner looking at a large inactive
     * number needs to know which one they are looking at.
     */
    const studentsWith = (status: UserStatus) =>
      this.prisma.student.count({ where: { user: { status } } });

    const [
      institutes,
      activeInstitutes,
      students,
      activeStudents,
      pendingStudents,
      disabledStudents,
      staff,
      exams,
      recentExams,
      attempts,
      recentAttempts,
      newInstitutes,
      liveExams,
      busiest,
    ] = await Promise.all([
      this.prisma.institute.count(),
      this.prisma.institute.count({ where: { isActive: true } }),
      this.prisma.student.count(),
      studentsWith(UserStatus.ACTIVE),
      studentsWith(UserStatus.PENDING),
      studentsWith(UserStatus.DISABLED),
      this.prisma.user.count({
        where: { roles: { hasSome: ['ADMIN', 'TEACHER'] } },
      }),
      this.prisma.exam.count(),
      // Authored in the window, matching how `newInstitutes` reads the same
      // 30 days — not exams *sat* in it, which is what `attempts` measures.
      this.prisma.exam.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.attempt.count({
        where: { status: { notIn: PRE_START_ATTEMPT_STATUSES } },
      }),
      this.prisma.attempt.count({
        where: { startedAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.institute.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.attempt.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.attempt.groupBy({
        by: ['instituteId'],
        where: { status: { notIn: PRE_START_ATTEMPT_STATUSES } },
        _count: { _all: true },
        orderBy: { _count: { instituteId: 'desc' } },
        take: 5,
      }),
    ]);

    // Name the busiest tenants rather than showing bare ids.
    const names = await this.prisma.institute.findMany({
      where: { id: { in: busiest.map((b) => b.instituteId) } },
      select: { id: true, name: true, slug: true },
    });
    const nameById = new Map(names.map((n) => [n.id, n]));

    return {
      totals: {
        institutes,
        activeInstitutes,
        suspendedInstitutes: institutes - activeInstitutes,
        students,
        activeStudents,
        pendingStudents,
        disabledStudents,
        staff,
        exams,
        attempts,
      },
      last30Days: {
        attempts: recentAttempts,
        newInstitutes,
        exams: recentExams,
      },
      liveExams,
      busiestInstitutes: busiest.map((b) => ({
        id: b.instituteId,
        name: nameById.get(b.instituteId)?.name ?? 'Unknown',
        slug: nameById.get(b.instituteId)?.slug ?? '',
        attempts: b._count._all,
      })),
      /** Tenant sign-ups per day, for the growth chart. */
      growth: await this.instituteGrowth(),
    };
  }

  usageSnapshot(days: number) {
    return this.usage.snapshot(days);
  }

  /** Institutes created per month for the last 12 months, oldest first. */
  private async instituteGrowth() {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 11, 1);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.prisma.institute.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = r.createdAt.toISOString().slice(0, 7);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const out: { month: string; value: number }[] = [];
    let running = await this.prisma.institute.count({
      where: { createdAt: { lt: since } },
    });
    for (let i = 0; i < 12; i++) {
      const d = new Date(since);
      d.setUTCMonth(d.getUTCMonth() + i);
      const key = d.toISOString().slice(0, 7);
      running += counts.get(key) ?? 0;
      out.push({ month: key, value: running });
    }
    return out;
  }
}
