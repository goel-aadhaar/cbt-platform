import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../database/prisma.service';
import { Role } from '../auth/auth.types';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { ResultsService } from '../results/results.service';
import { AttemptStatus } from '../attempts/attempt.types';
import { ExamKind, ExamStatus } from './exam.types';

/**
 * Assessment's automatic lifecycle (§ Assessments): "no admin action should
 * be required" when an assessment's window ends. This is the first scheduled
 * background job this codebase has ever had — every other "expiry" concept
 * here (OTP, session, an individual attempt's own clock) is checked lazily,
 * on the next request that happens to touch that row, which is exactly
 * wrong for a requirement that has to hold even when NO request ever
 * arrives again (no student browser open, teacher offline, admin offline).
 *
 * Runs every 30 seconds — frequent enough that "closes automatically" feels
 * true for exam windows measured in minutes-to-hours, without adding
 * meaningful load for an exam catalogue that stays in the dozens-to-hundreds
 * per institute.
 */
@Injectable()
export class AssessmentClosureService {
  private readonly logger = new Logger(AssessmentClosureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly results: ResultsService,
  ) {}

  @Cron('*/30 * * * * *')
  async sweep(): Promise<void> {
    // `autoClosedAt: null` is the ONLY retry gate — deliberately not status,
    // since status flips to ARCHIVED before evaluate() runs (so the exam
    // stops accepting attempts immediately) but `autoClosedAt` is only set
    // once evaluate() actually succeeds. A row that got archived on one
    // tick but whose evaluate() call then failed is still picked up here on
    // the next tick — it is PUBLISHED-turned-ARCHIVED with evaluation still
    // outstanding, not "already fully closed".
    //
    // Wrapped for the same reason as the per-exam catch below, but with a
    // sharper consequence: @nestjs/schedule does not await this method, so a
    // rejection escaping it is an UNHANDLED rejection, and Node terminates
    // the process. A managed Postgres that drops idle connections therefore
    // turned a routine reconnect — on a sweep that had nothing to do — into
    // an API outage, roughly every thirty seconds of bad luck.
    let due: {
      id: string;
      instituteId: string;
      createdById: string;
      status: ExamStatus;
    }[];
    try {
      due = await this.prisma.exam.findMany({
        where: {
          kind: ExamKind.ASSESSMENT,
          endAt: { lte: new Date() },
          autoClosedAt: null,
          status: { in: [ExamStatus.PUBLISHED, ExamStatus.ARCHIVED] },
        },
        select: {
          id: true,
          instituteId: true,
          createdById: true,
          status: true,
        },
      });
    } catch (err) {
      this.logger.error(
        'Assessment closure sweep could not read due exams — will retry next sweep',
        err instanceof Error ? err.stack : err,
      );
      return;
    }

    for (const exam of due) {
      try {
        await this.closeOne(exam);
      } catch (err) {
        // Swallowed deliberately: the next tick retries automatically (see
        // the `autoClosedAt` gate above) — a transient DB/network failure
        // here costs at most one sweep interval, not a permanently-stuck
        // assessment. See DEPLOYMENT's "failure recovery" requirement,
        // satisfied here without a queue.
        this.logger.error(
          `Assessment auto-close failed for exam ${exam.id} — will retry next sweep`,
          err instanceof Error ? err.stack : err,
        );
      }
    }
  }

  /**
   * Closes exactly one assessment: claim the archive transition (idempotency
   * guard against an overlapping tick), auto-submit whatever attempts never
   * got touched again after their own window/clock expiry, then evaluate —
   * which, on this kind's forced `resultPolicy: IMMEDIATE`, ranks and
   * publishes results and the leaderboard as part of the same existing call
   * every Mock Test "Evaluate" button already makes. Nothing new was built
   * for scoring/ranking/publishing/leaderboard — this only automates WHEN
   * the existing engine runs.
   *
   * `autoClosedAt` is set only in the LAST step, after evaluate() has
   * actually returned — so a failure between archiving and evaluating
   * leaves the row exactly where the next tick's query above will find it
   * again and retry just the outstanding evaluate() call, not redo the
   * archive-and-auto-submit step a second time.
   */
  private async closeOne(exam: {
    id: string;
    instituteId: string;
    createdById: string;
    status: ExamStatus;
  }): Promise<void> {
    if (exam.status === ExamStatus.PUBLISHED) {
      // Conditioned on status, same idiom the rest of this codebase uses
      // for every race-prone transition (submit/abandon/violation
      // auto-submit) — whichever process's write actually lands wins the
      // claim; a second concurrent tick (there is only one process today,
      // but this is what makes a future second instance safe too) matches
      // zero rows and does nothing further.
      const claimed = await this.prisma.exam.updateMany({
        where: { id: exam.id, status: ExamStatus.PUBLISHED },
        data: { status: ExamStatus.ARCHIVED },
      });
      if (claimed.count === 0) return;

      // Same class of event as an individual attempt's own lazy time-expiry
      // (getActiveAttempt) — the window simply ended — not a violation or
      // an admin intervention, so `flagged` stays false. This only catches
      // attempts nobody's own next request ever touched again; begin()
      // already caps an assessment attempt's expiresAt at the window end,
      // so most would already have auto-submitted themselves on their next
      // poll.
      await this.prisma.attempt.updateMany({
        where: { examId: exam.id, status: AttemptStatus.IN_PROGRESS },
        data: {
          status: AttemptStatus.AUTO_SUBMITTED,
          submittedAt: new Date(),
        },
      });
    }
    // else: already ARCHIVED from an earlier tick whose evaluate() call
    // failed after the archive+auto-submit step landed — nothing above
    // needs redoing, only evaluate() itself.

    // ResultsService (like every other tenant-scoped service in this
    // codebase) reads instituteId from AsyncLocalStorage, which only a real
    // HTTP request normally populates. `TenantContextService.run` is the
    // documented escape hatch for exactly this — "seeding, background jobs"
    // — so evaluate() runs completely unmodified inside a synthetic
    // ADMIN-role context scoped to this one institute. ADMIN (not TEACHER)
    // specifically so TeacherScopeService's batch restriction — which only
    // ever applies to a TEACHER-role context — cannot narrow what this
    // system action can see.
    await this.tenant.run(
      {
        userId: exam.createdById,
        role: Role.ADMIN,
        instituteId: exam.instituteId,
        isSuperadmin: false,
      },
      () => this.results.evaluate(exam.id),
    );

    await this.prisma.exam.update({
      where: { id: exam.id },
      data: { autoClosedAt: new Date() },
    });
  }
}
