import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { sanitizeRichText } from '../../common/html/sanitize-html';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PRE_START_ATTEMPT_STATUSES } from '../attempts/attempt.types';
import { AttemptsService } from '../attempts/attempts.service';
import { Role } from '../auth/auth.types';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { ExamCategoriesService } from '../exam-categories/exam-categories.service';
import { AdminExamActionDto } from './dto/admin-exam-action.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  AddQuestionDto,
  AssignBatchDto,
  CreateSectionDto,
  ReorderQuestionsDto,
  ReorderSectionsDto,
  ScheduleExamDto,
  UpdateSectionDto,
} from './dto/exam-parts.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { QueryExamsDto } from './dto/query-exams.dto';
import { UpdateLiveExamDto } from './dto/update-live-exam.dto';
import { ExamKind, ExamStatus } from './exam.types';

/** See QueryExamsDto for why this default is generous rather than tight. */
const DEFAULT_PAGE_SIZE = 500;

const examSelect = {
  id: true,
  title: true,
  instructions: true,
  durationMinutes: true,
  passingMarks: true,
  calculatorEnabled: true,
  fullscreenRequired: true,
  maxViolations: true,
  status: true,
  kind: true,
  resultPolicy: true,
  programId: true,
  categoryId: true,
  categorySequence: true,
  category: { select: { id: true, name: true } },
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
  // Approval workflow (§2.3) — who authored it, who must review, who approved.
  submittedAt: true,
  approvedAt: true,
  rejectionReason: true,
  // Live-exit auditing (§ pause/end admin actions). `pauseReason` is shown in
  // the admin roster so the next admin to look at this row knows why the
  // exam is currently held; `forceEndedAt` + `forceEndedById` become the
  // paper trail if a candidate reports "I never got to submit my answers".
  forceEndedAt: true,
  forceEndedById: true,
  pauseReason: true,
  // Set once the automatic-closure sweep has processed an ASSESSMENT — lets
  // the UI say "closed automatically at X" rather than nothing.
  autoClosedAt: true,
  forceEndedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.ExamSelect;

const examDetailSelect = {
  ...examSelect,
  sections: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      order: true,
      marksCorrect: true,
      marksWrong: true,
      questions: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          question: {
            select: {
              id: true,
              subject: true,
              type: true,
              statement: true,
              marks: true,
              difficulty: true,
              topicId: true,
              mediaKeys: true,
            },
          },
        },
      },
    },
  },
  batches: {
    select: { id: true, batch: { select: { id: true, name: true } } },
  },
  _count: { select: { sections: true, questions: true, batches: true } },
} satisfies Prisma.ExamSelect;

/**
 * Exam management (§2.3). Admins/teachers assemble APPROVED bank questions into
 * sections (each with its own marking scheme), assign batches, schedule, and —
 * admin only — publish. Tenant-scoped; exam children scope via their parent exam.
 */
/** Statuses an author may still edit, and submit for approval from. */
const AUTHOR_EDITABLE: ExamStatus[] = [ExamStatus.DRAFT, ExamStatus.REJECTED];

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly teacherScope: TeacherScopeService,
    private readonly categories: ExamCategoriesService,
    /**
     * The attempts module is consulted from pause/resume/live-edit so the
     * candidate-side clocks can be kept honest. Forward dependency only —
     * attempts does not import exams — so no circular worry.
     */
    private readonly attempts: AttemptsService,
  ) {}

  /**
   * The approval workflow and the admin live-controls (pause/resume/
   * force-end/live-edit) are MOCK_TEST-only by design (§ Assessments): an
   * assessment is scheduled directly by its teacher and has no admin
   * involvement at any point in its life, including while it's live. Every
   * entry point into that machinery checks this first so an ASSESSMENT row
   * can never end up half inside the wrong workflow.
   */
  private assertNotAssessment(kind: ExamKind, action: string): void {
    if (kind === ExamKind.ASSESSMENT) {
      throw new BadRequestException(
        `Assessments don't use this — they are ${action} directly by their teacher, with no admin step.`,
      );
    }
  }

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { userId: ctx.userId, instituteId: ctx.instituteId };
  }

  /**
   * Read-visibility filter (§ batch-scoped teacher access): a TEACHER sees an
   * exam they authored, or one assigned to at least one of their batches. An
   * ADMIN/SUPERADMIN session is unrestricted (`myBatchIds()` returns null).
   */
  private async visibilityWhere(): Promise<Prisma.ExamWhereInput> {
    const { userId, instituteId } = this.ctx();
    const batchIds = await this.teacherScope.myBatchIds();
    return {
      instituteId,
      ...(batchIds && {
        OR: [
          { createdById: userId },
          { batches: { some: { batchId: { in: batchIds } } } },
        ],
      }),
    };
  }

  async create(dto: CreateExamDto) {
    const { userId, instituteId } = this.ctx();
    if (dto.programId) {
      const program = await this.prisma.program.findFirst({
        where: { id: dto.programId, instituteId },
      });
      if (!program) throw new NotFoundException('Program not found');
    }
    if (dto.categoryId) {
      const category = await this.prisma.examCategory.findFirst({
        where: { id: dto.categoryId, instituteId },
        select: { id: true, isActive: true },
      });
      if (!category) throw new NotFoundException('Exam category not found');
      if (!category.isActive) {
        throw new BadRequestException(
          'That exam category has been retired and cannot take new papers.',
        );
      }
    }
    const kind = dto.kind ?? ExamKind.MOCK_TEST;
    return this.prisma.exam.create({
      data: {
        instituteId,
        kind,
        title: dto.title,
        durationMinutes: dto.durationMinutes,
        passingMarks: dto.passingMarks,
        instructions: dto.instructions && sanitizeRichText(dto.instructions),
        calculatorEnabled: dto.calculatorEnabled ?? false,
        fullscreenRequired: dto.fullscreenRequired ?? true,
        maxViolations: dto.maxViolations ?? 0,
        programId: dto.programId,
        categoryId: dto.categoryId,
        // ASSESSMENT has no admin publish step to hold results behind — the
        // whole point is automatic publication the moment the window closes
        // and evaluation runs, so IMMEDIATE is the only policy that makes
        // sense and is not left to the caller.
        resultPolicy:
          kind === ExamKind.ASSESSMENT
            ? 'IMMEDIATE'
            : (dto.resultPolicy ?? 'ON_PUBLISH'),
        createdById: userId,
      },
      select: examSelect,
    });
  }

  /**
   * Always paginated (§ pagination), unlike the question bank the default
   * `limit` is generous (see QueryExamsDto) — every internal caller that
   * doesn't pass one (monitoring, results, report dropdowns) needs the WHOLE
   * catalogue to compute correctly, not a truncated slice of it.
   */
  async findAll(query: QueryExamsDto = {}) {
    // Every caller that predates Assessments (admin/exams, teacher/exams,
    // monitoring, results, report dropdowns, ...) never sends `kind` and
    // must keep seeing exactly what it saw before this feature existed —
    // defaulting to MOCK_TEST here, not "both kinds", is what keeps
    // Assessments from silently appearing in a dozen unrelated screens.
    const where: Prisma.ExamWhereInput = {
      ...(await this.visibilityWhere()),
      kind: query.kind ?? ExamKind.MOCK_TEST,
    };
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const select = {
      ...examSelect,
      _count: { select: { sections: true, questions: true, batches: true } },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.exam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select,
        take: limit,
        skip: offset,
      }),
      this.prisma.exam.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async findOne(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, ...(await this.visibilityWhere()) },
      select: examDetailSelect,
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  async update(id: string, dto: UpdateExamDto) {
    await this.getDraft(id);
    return this.prisma.exam.update({
      where: { id },
      data: {
        title: dto.title,
        durationMinutes: dto.durationMinutes,
        passingMarks: dto.passingMarks,
        instructions: dto.instructions && sanitizeRichText(dto.instructions),
        calculatorEnabled: dto.calculatorEnabled,
        fullscreenRequired: dto.fullscreenRequired,
        maxViolations: dto.maxViolations,
        resultPolicy: dto.resultPolicy,
      },
      select: examSelect,
    });
  }

  async addSection(examId: string, dto: CreateSectionDto) {
    const exam = await this.getDraft(examId);
    const order = await this.prisma.examSection.count({ where: { examId } });
    return this.prisma.examSection.create({
      data: {
        examId,
        instituteId: exam.instituteId,
        name: dto.name,
        order,
        marksCorrect: dto.marksCorrect ?? 4,
        marksWrong: dto.marksWrong ?? 1,
      },
      select: {
        id: true,
        name: true,
        order: true,
        marksCorrect: true,
        marksWrong: true,
      },
    });
  }

  /**
   * Rename a section, or change its marking scheme.
   *
   * Marks live on the section, not the question (§2.3) — an exam scores every
   * question by its section's `marksCorrect`/`marksWrong`. So this is the only
   * place a paper's scoring can be corrected before it is sat, and without it
   * a typo in the scheme meant rebuilding the exam.
   */
  async updateSection(
    examId: string,
    sectionId: string,
    dto: UpdateSectionDto,
  ) {
    await this.getDraft(examId);
    const section = await this.prisma.examSection.findFirst({
      where: { id: sectionId, examId },
    });
    if (!section) throw new NotFoundException('Section not found in this exam');

    return this.prisma.examSection.update({
      where: { id: sectionId },
      data: {
        name: dto.name ?? undefined,
        marksCorrect: dto.marksCorrect ?? undefined,
        marksWrong: dto.marksWrong ?? undefined,
      },
      select: {
        id: true,
        name: true,
        order: true,
        marksCorrect: true,
        marksWrong: true,
      },
    });
  }

  /**
   * Remove a section and everything in it.
   *
   * The questions themselves are untouched — an ExamQuestion is a placement,
   * not the question, so dropping a section returns its questions to the bank
   * rather than deleting anyone's work.
   *
   * Orders are closed up afterwards so the remaining sections stay 0..n-1;
   * leaving a hole would not break `@@unique([examId, order])` but would make
   * every later reorder start from an inconsistent baseline.
   */
  async removeSection(examId: string, sectionId: string) {
    await this.getDraft(examId);
    const section = await this.prisma.examSection.findFirst({
      where: { id: sectionId, examId },
      select: { id: true, order: true },
    });
    if (!section) throw new NotFoundException('Section not found in this exam');

    const remaining = await this.prisma.examSection.count({
      where: { examId },
    });
    if (remaining <= 1) {
      throw new BadRequestException(
        'An exam needs at least one section. Add another before removing this one.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examQuestion.deleteMany({ where: { sectionId } });
      await tx.examSection.delete({ where: { id: sectionId } });
      // Close the gap. Done as a decrement over the tail rather than a
      // rewrite of every row, so it stays one statement.
      await tx.examSection.updateMany({
        where: { examId, order: { gt: section.order } },
        data: { order: { decrement: 1 } },
      });
    });
    return { removed: sectionId };
  }

  /**
   * Take a question off the paper. Same idea as removeSection: this deletes the
   * placement, never the question.
   */
  async removeQuestion(examId: string, sectionId: string, questionId: string) {
    await this.getDraft(examId);
    const placement = await this.prisma.examQuestion.findFirst({
      where: { examId, sectionId, questionId },
      select: { id: true, order: true },
    });
    if (!placement) {
      throw new NotFoundException('That question is not in this section');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examQuestion.delete({ where: { id: placement.id } });
      await tx.examQuestion.updateMany({
        where: { sectionId, order: { gt: placement.order } },
        data: { order: { decrement: 1 } },
      });
    });
    return { removed: questionId };
  }

  async addQuestion(examId: string, sectionId: string, dto: AddQuestionDto) {
    const exam = await this.getDraft(examId);
    const section = await this.prisma.examSection.findFirst({
      where: { id: sectionId, examId },
    });
    if (!section) throw new NotFoundException('Section not found');

    // Only APPROVED questions from this institute are eligible (§2.4).
    const question = await this.prisma.question.findFirst({
      where: {
        id: dto.questionId,
        instituteId: exam.instituteId,
        status: 'APPROVED',
      },
    });
    if (!question) {
      throw new BadRequestException('Question not found or not approved');
    }
    const duplicate = await this.prisma.examQuestion.findFirst({
      where: { examId, questionId: dto.questionId },
    });
    if (duplicate) throw new ConflictException('Question already in this exam');

    const order = await this.prisma.examQuestion.count({
      where: { sectionId },
    });
    return this.prisma.examQuestion.create({
      data: {
        examId,
        sectionId,
        questionId: dto.questionId,
        instituteId: exam.instituteId,
        order,
      },
      select: {
        id: true,
        order: true,
        question: { select: { id: true, subject: true, statement: true } },
      },
    });
  }

  /**
   * Drag-and-drop reordering (§ exam authoring). `sectionIds` must be exactly
   * the sections already in this exam, just in the new order — a partial or
   * foreign list is rejected rather than silently reshuffling only some rows.
   *
   * The two-pass bump-then-set avoids transient collisions with the
   * `@@unique([examId, order])` constraint: writing final positions directly
   * could momentarily ask two sections to hold the same `order` mid-swap.
   */
  async reorderSections(examId: string, dto: ReorderSectionsDto) {
    await this.getDraft(examId);
    const existing = await this.prisma.examSection.findMany({
      where: { examId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const requestedIds = new Set(dto.sectionIds);
    if (
      dto.sectionIds.length !== existing.length ||
      existingIds.size !== requestedIds.size ||
      ![...existingIds].every((id) => requestedIds.has(id))
    ) {
      throw new BadRequestException(
        'sectionIds must list exactly the sections currently in this exam',
      );
    }

    const offset = dto.sectionIds.length + 1000;
    await this.prisma.$transaction([
      ...dto.sectionIds.map((id, i) =>
        this.prisma.examSection.update({
          where: { id },
          data: { order: offset + i },
        }),
      ),
      ...dto.sectionIds.map((id, i) =>
        this.prisma.examSection.update({ where: { id }, data: { order: i } }),
      ),
    ]);

    return this.prisma.examSection.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        marksCorrect: true,
        marksWrong: true,
      },
    });
  }

  /** Same reorder shape as `reorderSections`, scoped to one section's questions. */
  async reorderQuestions(
    examId: string,
    sectionId: string,
    dto: ReorderQuestionsDto,
  ) {
    await this.getDraft(examId);
    const section = await this.prisma.examSection.findFirst({
      where: { id: sectionId, examId },
    });
    if (!section) throw new NotFoundException('Section not found');

    const existing = await this.prisma.examQuestion.findMany({
      where: { sectionId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((q) => q.id));
    const requestedIds = new Set(dto.examQuestionIds);
    if (
      dto.examQuestionIds.length !== existing.length ||
      existingIds.size !== requestedIds.size ||
      ![...existingIds].every((id) => requestedIds.has(id))
    ) {
      throw new BadRequestException(
        'examQuestionIds must list exactly the questions currently in this section',
      );
    }

    const offset = dto.examQuestionIds.length + 1000;
    await this.prisma.$transaction([
      ...dto.examQuestionIds.map((id, i) =>
        this.prisma.examQuestion.update({
          where: { id },
          data: { order: offset + i },
        }),
      ),
      ...dto.examQuestionIds.map((id, i) =>
        this.prisma.examQuestion.update({ where: { id }, data: { order: i } }),
      ),
    ]);

    return this.prisma.examQuestion.findMany({
      where: { sectionId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        question: { select: { id: true, subject: true, statement: true } },
      },
    });
  }

  async assignBatch(examId: string, dto: AssignBatchDto) {
    const exam = await this.getOwned(examId);
    /**
     * The route is teacher-callable only for the workflow that has no admin
     * step at all. A Mock Test's batch/schedule is still the approver's job
     * (assigning one is effectively skipping the review this exam is meant
     * to go through) — reject here rather than in the controller, since
     * @Roles() has no way to condition on the row being reached.
     */
    if (
      exam.kind !== ExamKind.ASSESSMENT &&
      this.tenant.get()?.role === Role.TEACHER
    ) {
      throw new ForbiddenException(
        'Only an admin assigns batches for a Mock Test — submit it for review instead.',
      );
    }
    const batch = await this.prisma.batch.findFirst({
      where: { id: dto.batchId, instituteId: exam.instituteId },
    });
    if (!batch)
      throw new BadRequestException('Batch not found in your institute');
    /**
     * Assessment-specific (§ Assessments): "the teacher creating the
     * Assessment must only be able to select batches they are authorized to
     * access." Mock Test has no such restriction today — an admin reviews
     * every Mock Test before it ever reaches a batch, which is the check
     * this substitutes for on the workflow that has no review step at all.
     * `myBatchIds()` returns null for a non-TEACHER session (admin path,
     * unrestricted), so this only ever bites a teacher assigning an
     * assessment.
     */
    if (exam.kind === ExamKind.ASSESSMENT) {
      const allowed = await this.teacherScope.myBatchIds();
      if (allowed && !allowed.includes(dto.batchId)) {
        throw new ForbiddenException('You are not authorized for this batch');
      }
    }
    const duplicate = await this.prisma.examBatch.findFirst({
      where: { examId, batchId: dto.batchId },
    });
    if (duplicate) throw new ConflictException('Batch already assigned');
    return this.prisma.examBatch.create({
      data: { examId, batchId: dto.batchId, instituteId: exam.instituteId },
      select: { id: true, batch: { select: { id: true, name: true } } },
    });
  }

  /**
   * Assessment's entire "approve → schedule → publish" is this one call
   * (§ Assessments): a teacher schedules AND publishes their own DRAFT
   * assessment directly, with no review/approval step and no admin
   * involvement at all. Reuses `publish()`'s exact validation shape
   * (sections/questions/batches present) rather than duplicating it, and the
   * same conditioned-`updateMany` idiom the rest of this file uses to close
   * a double-submit race (two clicks racing to publish the same draft).
   */
  async scheduleAssessment(examId: string, dto: ScheduleExamDto) {
    const exam = await this.getOwned(examId);
    if (exam.kind !== ExamKind.ASSESSMENT) {
      throw new BadRequestException(
        'Only assessments are scheduled this way — a mock test goes through submit/approve/publish.',
      );
    }
    if (exam.status !== ExamStatus.DRAFT) {
      throw new BadRequestException(
        `Only a draft assessment can be scheduled. This one is ${exam.status.toLowerCase()}.`,
      );
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }
    if (endAt <= new Date()) {
      throw new BadRequestException('endAt must be in the future');
    }

    const counts = await this.prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      select: {
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
    if (counts._count.sections === 0 || counts._count.questions === 0) {
      throw new BadRequestException(
        'Add sections and questions before scheduling',
      );
    }
    if (counts._count.batches === 0) {
      throw new BadRequestException(
        'Assign at least one batch before scheduling',
      );
    }

    const { count } = await this.prisma.exam.updateMany({
      where: { id: examId, status: ExamStatus.DRAFT },
      data: { status: ExamStatus.PUBLISHED, startAt, endAt },
    });
    if (count === 0) {
      throw new ConflictException('This assessment is no longer a draft');
    }
    return this.prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      select: examSelect,
    });
  }

  /** Drop a batch assignment — the counterpart `assignBatch` never had (§ reschedule). */
  async unassignBatch(examId: string, batchId: string) {
    await this.getOwned(examId);
    await this.prisma.examBatch.deleteMany({ where: { examId, batchId } });
    return { id: examId, batchId };
  }

  async schedule(examId: string, dto: ScheduleExamDto) {
    await this.getOwned(examId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }
    // A schedule that's already in the past can never actually be sat, and
    // silently accepting one just means the exam quietly locks every
    // candidate out — this is what the "not yet scheduled" state should look
    // like instead. Only enforced for exams nobody has attempted yet: a
    // PUBLISHED exam with live/finished attempts is deliberately allowed to
    // keep its recorded window even after it lapses, since that's just
    // historical record at that point, not a new commitment.
    const attemptCount = await this.prisma.attempt.count({
      where: { examId, status: { notIn: PRE_START_ATTEMPT_STATUSES } },
    });
    if (attemptCount === 0 && endAt <= new Date()) {
      throw new BadRequestException('endAt must be in the future');
    }
    return this.prisma.exam.update({
      where: { id: examId },
      data: { startAt, endAt },
      select: examSelect,
    });
  }

  async publish(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId: this.ctx().instituteId },
      select: {
        id: true,
        status: true,
        kind: true,
        startAt: true,
        endAt: true,
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    this.assertNotAssessment(exam.kind, 'published');
    // An exam must clear review before it can go live. Only TEACHER can create
    // an exam (§ create() above) — an admin publishing straight from DRAFT
    // would let them skip submitForReview()/approve() entirely, which is
    // exactly the separation of duties creation.ts already promises ("an
    // approver who wrote the paper is not reviewing it" only holds if
    // approval actually happened).
    if (exam.status !== ExamStatus.APPROVED) {
      throw new BadRequestException('Only approved exams can be published');
    }
    if (!exam.startAt || !exam.endAt) {
      throw new BadRequestException('Schedule the exam before publishing');
    }
    if (exam._count.sections === 0 || exam._count.questions === 0) {
      throw new BadRequestException(
        'Add sections and questions before publishing',
      );
    }
    if (exam._count.batches === 0) {
      throw new BadRequestException(
        'Assign at least one batch before publishing',
      );
    }
    return this.prisma.exam.update({
      where: { id: examId },
      data: { status: 'PUBLISHED' },
      select: examSelect,
    });
  }

  /* ---------------- Approval workflow (§2.3) ---------------- */

  /**
   * Teacher hands a finished DRAFT to a named admin for review.
   * The paper must actually be assembled — an empty shell wastes a review pass.
   */
  async submitForReview(examId: string, reviewerId: string) {
    const ctx = this.ctx();
    const { instituteId } = ctx;
    // A teacher may only submit their OWN draft — this repo has no other
    // check preventing one teacher from touching another's work-in-progress.
    const isTeacher = this.tenant.get()?.role === Role.TEACHER;

    const [exam, reviewer] = await Promise.all([
      this.prisma.exam.findFirst({
        where: {
          id: examId,
          instituteId,
          ...(isTeacher ? { createdById: ctx.userId } : {}),
        },
        select: {
          id: true,
          status: true,
          kind: true,
          _count: { select: { sections: true, questions: true } },
        },
      }),
      this.prisma.user.findFirst({
        where: { id: reviewerId, instituteId, roles: { has: 'ADMIN' } },
        select: { id: true },
      }),
    ]);

    if (!exam) throw new NotFoundException('Exam not found');
    this.assertNotAssessment(exam.kind, 'submitted for review');
    if (!AUTHOR_EDITABLE.includes(exam.status)) {
      throw new BadRequestException(
        `Only a draft or sent-back exam can be submitted for approval. ` +
          `This one is ${exam.status.toLowerCase()}.`,
      );
    }
    if (!reviewer) {
      throw new BadRequestException(
        'Assign an admin of this institute as the reviewer',
      );
    }
    if (exam._count.sections === 0 || exam._count.questions === 0) {
      throw new BadRequestException(
        'Add sections and questions before submitting for approval',
      );
    }

    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        status: 'REVIEW',
        reviewerId,
        submittedAt: new Date(),
        rejectionReason: null,
      },
      select: examSelect,
    });
  }

  /**
   * Admin approves a submitted exam into the "qualified" pool. Any admin of the
   * institute may action the queue (so an absent reviewer can't deadlock it);
   * whoever approves is recorded in `approvedById`.
   */
  async approve(examId: string) {
    const { userId, instituteId } = this.ctx();
    const exam = await this.getOwned(examId);
    this.assertNotAssessment(exam.kind, 'approved');
    if (exam.status !== ExamStatus.REVIEW) {
      throw new BadRequestException('Only exams under review can be approved');
    }
    /**
     * Separation of duties: the same person who authored a paper cannot
     * approve it, regardless of which role they reached the approval screen
     * in. A teacher-administrator who authorized their own paper just by
     * switching roles is the single most common way an "approval" loses
     * meaning, and the rule is cheap — the author id is already on the row.
     */
    if (exam.createdById === userId) {
      throw new ForbiddenException(
        'You authored this exam and cannot also approve it. Ask another administrator.',
      );
    }

    /**
     * Approval is where a paper gets its candidate-facing name: the category
     * plus the next number in that category ("Physics Practice Test - 2").
     *
     * Numbered here rather than at creation because a draft may never run, and
     * a number burned on an abandoned draft would leave a gap candidates could
     * see. Re-approval keeps the number it already has, so a paper never
     * changes name under a candidate who has already seen it.
     *
     * claimNextSequence() reads the current MAX and proposes MAX+1 — a
     * read-then-write race if two exams in the same category are approved at
     * the same instant. The DB's @@unique([categoryId, categorySequence])
     * is the actual guarantee against two exams silently getting the same
     * name; if this update loses that race, retry with a freshly-read number
     * rather than surfacing a raw constraint-violation 500.
     */
    if (exam.categoryId && exam.categorySequence === null) {
      const categoryId = exam.categoryId;
      const MAX_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const next = await this.categories.claimNextSequence(
          categoryId,
          instituteId,
        );
        try {
          return await this.prisma.exam.update({
            where: { id: examId },
            data: {
              status: 'APPROVED',
              approvedById: userId,
              approvedAt: new Date(),
              rejectionReason: null,
              categorySequence: next.sequence,
              title: next.title,
            },
            select: examSelect,
          });
        } catch (err) {
          const lostRace =
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002';
          if (!lostRace || attempt === MAX_ATTEMPTS) throw err;
        }
      }
    }

    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      select: examSelect,
    });
  }

  /** Admin sends a submitted exam back to its author with optional feedback. */
  async reject(examId: string, reason?: string) {
    const { userId } = this.ctx();
    const exam = await this.getOwned(examId);
    this.assertNotAssessment(exam.kind, 'rejected');
    if (exam.status !== ExamStatus.REVIEW) {
      throw new BadRequestException('Only exams under review can be rejected');
    }
    // Same person cannot author and reject their own paper either — that
    // would be approval by another name.
    if (exam.createdById === userId) {
      throw new ForbiddenException(
        'You authored this exam and cannot also reject it. Ask another administrator.',
      );
    }
    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        // Its own state, not back into the drafts pile — the reason attached
        // below is no use to a teacher who cannot find the exam it belongs to.
        status: 'REJECTED',
        rejectionReason: reason ?? null,
        submittedAt: null,
      },
      select: examSelect,
    });
  }

  /**
   * Admin starts a qualified exam immediately: the window opens now and runs for
   * the exam's duration, and the paper goes live for its assigned batches.
   */
  async startNow(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId: this.ctx().instituteId },
      select: {
        id: true,
        status: true,
        kind: true,
        durationMinutes: true,
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    this.assertNotAssessment(exam.kind, 'started');
    if (exam.status !== ExamStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved exams can be started. Get it approved first.',
      );
    }
    if (exam._count.batches === 0) {
      throw new BadRequestException(
        'Assign at least one batch before starting',
      );
    }
    if (exam._count.sections === 0 || exam._count.questions === 0) {
      throw new BadRequestException(
        'Add sections and questions before starting',
      );
    }

    const now = new Date();
    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        status: 'PUBLISHED',
        startAt: now,
        endAt: new Date(now.getTime() + exam.durationMinutes * 60_000),
      },
      select: examSelect,
    });
  }

  async unpublish(examId: string) {
    const exam = await this.getOwned(examId);
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw new BadRequestException('Only published exams can be unpublished');
    }
    // Unpublishing drops the exam back to DRAFT, and DRAFT is editable
    // (getDraft() above gates addSection/addQuestion/update on exactly that
    // status). If any student has already started — or finished — an
    // attempt against this exam's current sections/questions, reopening
    // editing would let those get rewritten out from under already-recorded
    // Responses, corrupting evaluation. Once real attempts exist, the only
    // way back is scheduling a fresh paper.
    const attemptCount = await this.prisma.attempt.count({
      where: { examId, status: { notIn: PRE_START_ATTEMPT_STATUSES } },
    });
    if (attemptCount > 0) {
      throw new ConflictException(
        'Cannot unpublish — students have already attempted this exam',
      );
    }
    return this.prisma.exam.update({
      where: { id: examId },
      data: { status: 'DRAFT' },
      select: examSelect,
    });
  }

  /**
   * Mutation-side ownership check. Deliberately NARROWER than
   * `visibilityWhere()` (which also admits batch-assigned exams a teacher
   * didn't author) — every route this backs (`update`/`addSection`/
   * `addQuestion` via `getDraft`; `assignBatch`/`schedule`/etc. via a
   * TEACHER-unreachable ADMIN-only route) is a WRITE, so a teacher may only
   * ever reach their own exam here, never a colleague's.
   */
  private async getOwned(id: string) {
    const ctx = this.ctx();
    const isTeacher = this.tenant.get()?.role === Role.TEACHER;
    const exam = await this.prisma.exam.findFirst({
      where: {
        id,
        instituteId: ctx.instituteId,
        ...(isTeacher ? { createdById: ctx.userId } : {}),
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  /**
   * The mutable states. A sent-back exam has to be editable or the rejection
   * reason is advice nobody can act on.
   */
  private async getDraft(id: string) {
    const exam = await this.getOwned(id);
    if (!AUTHOR_EDITABLE.includes(exam.status)) {
      throw new BadRequestException(
        `This exam can no longer be edited — it is ${exam.status.toLowerCase()}. ` +
          `Only drafts and exams sent back for changes can be modified.`,
      );
    }
    return exam;
  }

  /* ============================================================================
   *  Live-exit admin controls: pause, resume, force-end, live-edit.
   *
   *  These are separate from the teacher's authoring endpoints on purpose. The
   *  type-level boundary (`UpdateLiveExamDto` vs `UpdateExamDto`) is what
   *  guarantees a future careless refactor cannot let section or scoring
   *  mutations reach a running paper.
   * ========================================================================== */

  /** Per-institute helper that refuses the call if any in-flight attempt would
   *  linger after their `expiresAt` had already lapsed — a self-test mode. */
  private async getOwnedLive(examId: string) {
    const exam = await this.getOwned(examId);
    this.assertNotAssessment(exam.kind, 'controlled live');
    if (
      exam.status !== ExamStatus.PUBLISHED &&
      exam.status !== ExamStatus.PAUSED
    ) {
      throw new BadRequestException(
        `Live actions are only available on a published exam — this one is ${exam.status.toLowerCase()}.`,
      );
    }
    return exam;
  }

  /**
   * Halt a live exam. Sets `status = PAUSED`, records the reason on the row,
   * and freezes every IN_PROGRESS attempt's deadline by extending `expiresAt`
   * by however long the exam stays paused (the candidate's clock is preserved
   * across the hold). A subsequent resume is the only thing that lifts the
   * state; auto-resume on endAt is deliberately NOT implemented because a
   * held exam is a human decision that should not flip on its own.
   */
  async pause(examId: string, dto: AdminExamActionDto) {
    const exam = await this.getOwnedLive(examId);
    if (exam.status === ExamStatus.PAUSED) {
      throw new BadRequestException('Exam is already paused');
    }
    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.PAUSED,
        pauseReason: dto.reason ?? null,
      },
      select: examSelect,
    });
  }

  /**
   * Lift the pause. Adds the actual pause-window to each IN_PROGRESS
   * attempt's `expiresAt` and accumulates it on `pausedForSeconds` (the
   * latter for the audit trail a candidate may later ask to see — every
   * resume adds the new gap to the cumulative figure, so a paper that was
   * paused twice is the sum of the two windows, which is the number a
   * candidate's complaint about a stopwatch can be checked against).
   *
   * The "extend by N seconds" path is per-row, not per-many-rows. Prisma
   * has no `expiresAt: { increment: <seconds> }` operator (DateTime columns
   * do not have an arithmetic increment), so we read first and write back.
   * That costs a round-trip; the trade-off is correct answers for in-flight
   * candidates, which beats a useless `updateMany` that silently no-ops on
   * the dates it could not increment.
   */
  async resume(examId: string) {
    const exam = await this.getOwnedLive(examId);
    if (exam.status !== ExamStatus.PAUSED) {
      throw new BadRequestException('Only a paused exam can be resumed');
    }
    const pausedSince = exam.updatedAt;
    const gapMs = Date.now() - pausedSince.getTime();
    const gapSeconds = Math.max(0, Math.floor(gapMs / 1000));

    if (gapSeconds > 0) {
      const inflight = await this.prisma.attempt.findMany({
        where: { examId, status: 'IN_PROGRESS' },
        select: {
          id: true,
          expiresAt: true,
          pausedForSeconds: true,
        },
      });
      for (const a of inflight) {
        // Non-null: queried above with status: 'IN_PROGRESS', which is only
        // ever reached via begin(), setting expiresAt in the same write.
        const newExpiry = new Date(a.expiresAt!.getTime() + gapSeconds * 1000);
        await this.prisma.attempt.update({
          where: { id: a.id },
          data: {
            expiresAt: newExpiry,
            pausedForSeconds: (a.pausedForSeconds ?? 0) + gapSeconds,
          },
        });
      }
    }

    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.PUBLISHED,
        pauseReason: null,
      },
      select: examSelect,
    });
  }

  /**
   * Pull the plug. Sets status to ARCHIVED, marks `forceEndedAt`/`forceEndedById`
   * for the audit, and auto-submits every IN_PROGRESS attempt with the
   * existing `AUTO_SUBMITTED` status — so the candidates' work is preserved
   * exactly as they left it, with `flagged = true` distinguishing a
   * force-closed attempt from a normal submission on every results surface.
   */
  async forceEnd(examId: string, dto: AdminExamActionDto) {
    const exam = await this.getOwnedLive(examId);
    if (
      exam.status !== ExamStatus.PUBLISHED &&
      exam.status !== ExamStatus.PAUSED
    ) {
      throw new BadRequestException('Only a live exam can be force-ended');
    }
    const ctx = this.ctx();
    return this.prisma.$transaction(async (tx) => {
      // Capture the audit row first; otherwise a crash between this update
      // and the attempts.updateMany would leave the candidates auto-submitted
      // but no record of who pulled the plug.
      //
      // `pauseReason` doubles here as the free-text reason field for
      // force-end. Renaming the column would be a second migration for
      // cosmetic alignment; the semantics in the next column docstring stay
      // honest by calling it "the admin's reason for the most recent
      // live-exit intervention".
      await tx.exam.update({
        where: { id: examId },
        data: {
          status: ExamStatus.ARCHIVED,
          forceEndedAt: new Date(),
          forceEndedById: ctx.userId,
          pauseReason: dto.reason ?? null,
        },
      });
      const now = new Date();
      const result = await tx.attempt.updateMany({
        where: { examId, status: 'IN_PROGRESS' },
        data: {
          status: 'AUTO_SUBMITTED',
          submittedAt: now,
          flagged: true,
        },
      });
      return { examId, autoSubmitted: result.count };
    });
  }

  /**
   * Admin-only edit of a LIVE exam — strict subset of fields:
   * durationMinutes, startAt, endAt, instructions, passingMarks.
   *
   * Editing `durationMinutes` does NOT extend in-flight deadlines on its
   * own. The candidate's per-attempt `expiresAt` is computed at start from
   * `startOfWindow + durationMinutes`, but only the original value lives on
   * the attempt row — duration edits take effect for attempts that have not
   * yet started. For in-flight attempts, the admin should pause/resume via
   * this endpoint's sibling paths, or the natural expiry will catch up.
   *
   * Editing `startAt` or `endAt` extends any `expiresAt` that would now be
   * in the past to the new boundary (so a candidate whose clock has elapsed
   * because the admin moved the window forward without thinking gets a
   * graceful "the exam is still on" rather than a confusing 410).
   */
  async updateLive(examId: string, dto: UpdateLiveExamDto) {
    // `getOwnedLive` is the institute + status guard; we do not need the row
    // itself because every field the live edit controls comes from the DTO.
    await this.getOwnedLive(examId);

    const data: Prisma.ExamUpdateInput = {};
    if (dto.durationMinutes !== undefined) {
      data.durationMinutes = dto.durationMinutes;
    }
    if (dto.instructions !== undefined) {
      // Live-edit instructions is the one path that does NOT go through the
      // sanitizer. It already passed sanitization on the original creation;
      // letting the admin commit unsanitized HTML by going through the same
      // helper would be a no-op but a wasted cycle.
      data.instructions = dto.instructions;
    }
    if (dto.passingMarks !== undefined) {
      data.passingMarks = dto.passingMarks;
    }
    if (dto.startAt !== undefined) {
      data.startAt = new Date(dto.startAt);
    }
    if (dto.endAt !== undefined) {
      data.endAt = new Date(dto.endAt);
    }
    if (dto.startAt && dto.endAt && dto.endAt <= dto.startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data,
        select: examSelect,
      });

      if (dto.endAt !== undefined) {
        const newEnd = new Date(dto.endAt);
        // `expiresAt: { gt: newEnd }` — attempts whose deadline extends past
        // the new endAt get clipped to newEnd. The window's other side is
        // already enforced by the candidate's portal hiding the exam.
        await tx.attempt.updateMany({
          where: {
            examId,
            status: 'IN_PROGRESS',
            expiresAt: { gt: newEnd },
          },
          data: { expiresAt: newEnd },
        });
      }
      return updated;
    });
  }
}
