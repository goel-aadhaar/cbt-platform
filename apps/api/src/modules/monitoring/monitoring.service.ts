import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { toCsv, withBom } from '../../common/csv/to-csv';
import { ResponseStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
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
    private readonly teacherScope: TeacherScopeService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id) {
      throw new ForbiddenException('No institute in the current context');
    }
    return id;
  }

  async getExamMonitor(examId: string, query: MonitorQueryDto) {
    const ctx = this.tenant.get();
    const instituteId = this.instituteId();
    const scope = await this.teacherScope.myBatchIds();
    const exam = await this.prisma.exam.findFirst({
      where: {
        id: examId,
        instituteId,
        ...(scope && {
          OR: [
            { createdById: ctx?.userId },
            { batches: { some: { batchId: { in: scope } } } },
          ],
        }),
      },
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

    // Candidates = every student in the exam's assigned batches, further
    // narrowed to the caller's own batches when acting as TEACHER.
    const examBatches = await this.prisma.examBatch.findMany({
      where: { examId, instituteId },
      select: { batchId: true },
    });
    const batchIds = examBatches
      .map((b) => b.batchId)
      .filter((id) => !query.batchId || id === query.batchId)
      .filter((id) => scope === null || scope.includes(id));

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

    /**
     * When the candidate was last actually doing something.
     *
     * This used to report `Attempt.updatedAt`, which answering never touches —
     * autosave writes `Response` rows, not the attempt. So an invigilator
     * watching a hall full of working candidates saw every one of them frozen
     * at the moment they started, and the column that exists to spot a
     * disconnected candidate could never do it.
     *
     * The newest response write is the real signal, in the same shape of
     * grouped query as the answered count above.
     */
    const activityGroups = await this.prisma.response.groupBy({
      by: ['attemptId'],
      where: { attempt: { examId, instituteId } },
      _max: { updatedAt: true },
    });
    const lastActivityByAttempt = new Map(
      activityGroups.map((g) => [g.attemptId, g._max.updatedAt]),
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
        // Non-null: only read when inProgress, and IN_PROGRESS is only ever
        // reached via begin(), which sets expiresAt in the same write.
        remainingSeconds: inProgress
          ? Math.max(0, Math.floor((a.expiresAt!.getTime() - now) / 1000))
          : null,
        timeUp: inProgress && a.expiresAt!.getTime() <= now,
        answered: answeredByAttempt.get(a.id) ?? 0,
        violations: a.violationCount,
        flagged: a.flagged,
        // The newest response write, falling back to the attempt row for an
        // attempt that has been started but not yet answered.
        lastActivityAt: lastActivityByAttempt.get(a.id) ?? a.updatedAt,
      };
    });

    const counts = {
      notStarted: 0,
      // Entry-approval states (§ exam entry approval) — waiting on, or
      // decided by, an admin; none of these have a running clock.
      pendingApproval: 0,
      approved: 0,
      denied: 0,
      inProgress: 0,
      submitted: 0,
      autoSubmitted: 0,
    };
    for (const r of rows) {
      if (r.status === 'NOT_STARTED') counts.notStarted++;
      else if (r.status === 'PENDING_APPROVAL') counts.pendingApproval++;
      else if (r.status === 'APPROVED') counts.approved++;
      else if (r.status === 'DENIED') counts.denied++;
      else if (r.status === 'IN_PROGRESS') counts.inProgress++;
      else if (r.status === 'SUBMITTED') counts.submitted++;
      else if (r.status === 'AUTO_SUBMITTED') counts.autoSubmitted++;
    }

    const filteredRows = query.status
      ? rows.filter((r) => r.status === query.status)
      : rows;
    // Paged over the (possibly status-filtered) roster, not the DB query
    // itself — `status` reflects joined attempt state, so it's resolved in
    // application code either way; slicing here is what keeps a several-
    // hundred-candidate sitting from shipping as one unscrollable table.
    // `counts`/`totalStudents` above stay computed from the WHOLE roster,
    // never from this page.
    const pageOffset = query.offset ?? 0;
    const pageRows =
      query.limit != null
        ? filteredRows.slice(pageOffset, pageOffset + query.limit)
        : filteredRows;

    return {
      examId: exam.id,
      title: exam.title,
      examStatus: exam.status,
      window: { startAt: exam.startAt, endAt: exam.endAt },
      totalStudents: students.length,
      totalQuestions,
      counts,
      serverTime: new Date().toISOString(),
      students: pageRows,
      studentsTotal: filteredRows.length,
      limit: query.limit ?? filteredRows.length,
      offset: pageOffset,
    };
  }

  /**
   * Attendance for an exam: who was expected, who turned up, who did not.
   *
   * The platform had no attendance report at all — the participants screen's
   * "export" downloaded the result sheet, which is a different question and
   * silently omits everyone who never started. An institute needs the absence
   * list more than the score list when chasing up a missed exam.
   *
   * Built on the same assigned-candidate query as the live monitor, so a
   * concluded exam reports exactly the cohort it was set for rather than only
   * those who happen to have a result row.
   */
  async getAttendance(examId: string) {
    const snapshot = await this.getExamMonitor(examId, {});
    const rows = snapshot.students.map((s) => ({
      rollNumber: s.rollNumber,
      name: s.name,
      batch: s.batch?.name ?? '',
      // A pending/approved/denied entry request means the student never
      // actually sat down — only a row that has begun (or gone straight to
      // a terminal state) counts as attendance.
      present:
        s.status !== 'NOT_STARTED' &&
        s.status !== 'PENDING_APPROVAL' &&
        s.status !== 'APPROVED' &&
        s.status !== 'DENIED',
      status: s.status,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      answered: s.answered,
      totalQuestions: s.totalQuestions,
      violations: s.violations,
      flagged: s.flagged,
    }));
    const present = rows.filter((r) => r.present).length;
    return {
      examId: snapshot.examId,
      title: snapshot.title,
      window: snapshot.window,
      expected: rows.length,
      present,
      absent: rows.length - present,
      students: rows,
    };
  }

  /** Attendance as a CSV, absences included. */
  async exportAttendanceCsv(examId: string) {
    const report = await this.getAttendance(examId);
    const headers = [
      'Roll Number',
      'Name',
      'Batch',
      'Attendance',
      'Attempt Status',
      'Started At',
      'Submitted At',
      'Answered',
      'Total Questions',
      'Violations',
      'Flagged',
    ];
    const rows = report.students.map((s) => [
      s.rollNumber,
      s.name,
      s.batch,
      s.present ? 'Present' : 'Absent',
      s.status,
      s.startedAt ? new Date(s.startedAt).toISOString() : '',
      s.submittedAt ? new Date(s.submittedAt).toISOString() : '',
      s.answered,
      s.totalQuestions,
      s.violations,
      s.flagged ? 'Yes' : 'No',
    ]);
    const slug =
      report.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'exam';
    return {
      filename: `${slug}-attendance.csv`,
      csv: withBom(toCsv(headers, rows)),
    };
  }
}
