import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ResponseStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { MonitorQueryDto } from './dto/monitor-query.dto';

/**
 * Live exam monitoring (§2.12). A polling snapshot of every assigned candidate's
 * progress for an in-flight exam — including those who have not started yet.
 * Admins call this on an interval; a push (SSE/WebSocket) transport can layer on
 * the same query later.
 */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id) {
      throw new ForbiddenException('No institute in the current context');
    }
    return id;
  }

  async getExamMonitor(examId: string, query: MonitorQueryDto) {
    const instituteId = this.instituteId();
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: {
        id: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const totalQuestions = await this.prisma.examQuestion.count({
      where: { examId },
    });

    // Candidates = every student in the exam's assigned batches.
    const examBatches = await this.prisma.examBatch.findMany({
      where: { examId, instituteId },
      select: { batchId: true },
    });
    const batchIds = examBatches
      .map((b) => b.batchId)
      .filter((id) => !query.batchId || id === query.batchId);

    const students = batchIds.length
      ? await this.prisma.student.findMany({
          where: { instituteId, batchId: { in: batchIds } },
          select: {
            id: true,
            rollNumber: true,
            user: { select: { name: true } },
            batch: { select: { id: true, name: true } },
          },
          orderBy: { rollNumber: 'asc' },
        })
      : [];

    const attempts = await this.prisma.attempt.findMany({
      where: { examId, instituteId },
      select: {
        id: true,
        studentId: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        submittedAt: true,
        updatedAt: true,
        violationCount: true,
        flagged: true,
      },
    });
    const attemptByStudent = new Map(attempts.map((a) => [a.studentId, a]));

    // Answered count per attempt in one grouped query.
    const answeredGroups = await this.prisma.response.groupBy({
      by: ['attemptId'],
      where: {
        attempt: { examId, instituteId },
        status: {
          in: [ResponseStatus.ANSWERED, ResponseStatus.ANSWERED_MARKED],
        },
      },
      _count: { _all: true },
    });
    const answeredByAttempt = new Map(
      answeredGroups.map((g) => [g.attemptId, g._count._all]),
    );

    const now = Date.now();
    const rows = students.map((s) => {
      const a = attemptByStudent.get(s.id);
      const base = {
        studentId: s.id,
        rollNumber: s.rollNumber,
        name: s.user.name,
        batch: s.batch,
        totalQuestions,
      };
      if (!a) {
        return {
          ...base,
          status: 'NOT_STARTED' as const,
          startedAt: null,
          submittedAt: null,
          remainingSeconds: null,
          timeUp: false,
          answered: 0,
          violations: 0,
          flagged: false,
          lastActivityAt: null,
        };
      }
      const inProgress = a.status === 'IN_PROGRESS';
      return {
        ...base,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        remainingSeconds: inProgress
          ? Math.max(0, Math.floor((a.expiresAt.getTime() - now) / 1000))
          : null,
        timeUp: inProgress && a.expiresAt.getTime() <= now,
        answered: answeredByAttempt.get(a.id) ?? 0,
        violations: a.violationCount,
        flagged: a.flagged,
        lastActivityAt: a.updatedAt,
      };
    });

    const counts = {
      notStarted: 0,
      inProgress: 0,
      submitted: 0,
      autoSubmitted: 0,
    };
    for (const r of rows) {
      if (r.status === 'NOT_STARTED') counts.notStarted++;
      else if (r.status === 'IN_PROGRESS') counts.inProgress++;
      else if (r.status === 'SUBMITTED') counts.submitted++;
      else if (r.status === 'AUTO_SUBMITTED') counts.autoSubmitted++;
    }

    return {
      examId: exam.id,
      title: exam.title,
      examStatus: exam.status,
      window: { startAt: exam.startAt, endAt: exam.endAt },
      totalStudents: students.length,
      totalQuestions,
      counts,
      serverTime: new Date().toISOString(),
      students: query.status
        ? rows.filter((r) => r.status === query.status)
        : rows,
    };
  }
}
