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
import { Role } from '../auth/auth.types';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { ExamCategoriesService } from '../exam-categories/exam-categories.service';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  AddQuestionDto,
  AssignBatchDto,
  CreateSectionDto,
  ReorderQuestionsDto,
  ReorderSectionsDto,
  ScheduleExamDto,
} from './dto/exam-parts.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamStatus } from './exam.types';

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
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly teacherScope: TeacherScopeService,
    private readonly categories: ExamCategoriesService,
  ) {}

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
    return this.prisma.exam.create({
      data: {
        instituteId,
        title: dto.title,
        durationMinutes: dto.durationMinutes,
        passingMarks: dto.passingMarks,
        instructions: dto.instructions && sanitizeRichText(dto.instructions),
        calculatorEnabled: dto.calculatorEnabled ?? false,
        fullscreenRequired: dto.fullscreenRequired ?? true,
        maxViolations: dto.maxViolations ?? 0,
        programId: dto.programId,
        categoryId: dto.categoryId,
        resultPolicy: dto.resultPolicy ?? 'ON_PUBLISH',
        createdById: userId,
      },
      select: examSelect,
    });
  }

  async findAll() {
    return this.prisma.exam.findMany({
      where: await this.visibilityWhere(),
      orderBy: { createdAt: 'desc' },
      select: {
        ...examSelect,
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
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

  /**
   * Clone an exam (§2.3): duplicate its config, sections and question layout
   * into a fresh DRAFT. Batches, schedule and publish state are intentionally
   * NOT copied — the clone is re-scheduled and re-assigned before publishing.
   */
  async clone(examId: string, title?: string) {
    const { userId, instituteId } = this.ctx();
    const source = await this.prisma.exam.findFirst({
      where: { id: examId, instituteId },
      select: {
        title: true,
        instructions: true,
        durationMinutes: true,
        passingMarks: true,
        calculatorEnabled: true,
        fullscreenRequired: true,
        maxViolations: true,
        resultPolicy: true,
        programId: true,
        sections: {
          orderBy: { order: 'asc' },
          select: {
            name: true,
            order: true,
            marksCorrect: true,
            marksWrong: true,
            questions: {
              orderBy: { order: 'asc' },
              select: { questionId: true, order: true },
            },
          },
        },
      },
    });
    if (!source) throw new NotFoundException('Exam not found');

    const created = await this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          instituteId,
          title: title?.trim() || `${source.title} (Copy)`,
          instructions: source.instructions,
          durationMinutes: source.durationMinutes,
          passingMarks: source.passingMarks,
          calculatorEnabled: source.calculatorEnabled,
          fullscreenRequired: source.fullscreenRequired,
          maxViolations: source.maxViolations,
          resultPolicy: source.resultPolicy,
          programId: source.programId,
          createdById: userId,
        },
      });
      for (const section of source.sections) {
        const newSection = await tx.examSection.create({
          data: {
            examId: exam.id,
            instituteId,
            name: section.name,
            order: section.order,
            marksCorrect: section.marksCorrect,
            marksWrong: section.marksWrong,
          },
        });
        if (section.questions.length) {
          await tx.examQuestion.createMany({
            data: section.questions.map((q) => ({
              examId: exam.id,
              sectionId: newSection.id,
              questionId: q.questionId,
              instituteId,
              order: q.order,
            })),
          });
        }
      }
      return exam;
    });

    return this.findOne(created.id);
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
    const batch = await this.prisma.batch.findFirst({
      where: { id: dto.batchId, instituteId: exam.instituteId },
    });
    if (!batch)
      throw new BadRequestException('Batch not found in your institute');
    const duplicate = await this.prisma.examBatch.findFirst({
      where: { examId, batchId: dto.batchId },
    });
    if (duplicate) throw new ConflictException('Batch already assigned');
    return this.prisma.examBatch.create({
      data: { examId, batchId: dto.batchId, instituteId: exam.instituteId },
      select: { id: true, batch: { select: { id: true, name: true } } },
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
      where: { examId },
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
        startAt: true,
        endAt: true,
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
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
          _count: { select: { sections: true, questions: true } },
        },
      }),
      this.prisma.user.findFirst({
        where: { id: reviewerId, instituteId, roles: { has: 'ADMIN' } },
        select: { id: true },
      }),
    ]);

    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== ExamStatus.DRAFT) {
      throw new BadRequestException('Only draft exams can be submitted');
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
        status: 'DRAFT',
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
        durationMinutes: true,
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
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
      where: { examId },
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

  private async getDraft(id: string) {
    const exam = await this.getOwned(id);
    if (exam.status !== ExamStatus.DRAFT) {
      throw new BadRequestException('Exam is not editable (not a draft)');
    }
    return exam;
  }
}
