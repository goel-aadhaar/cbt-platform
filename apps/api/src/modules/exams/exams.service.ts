import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  AddQuestionDto,
  AssignBatchDto,
  CreateSectionDto,
  ScheduleExamDto,
} from './dto/exam-parts.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamStatus } from './exam.types';

const examSelect = {
  id: true,
  title: true,
  instructions: true,
  durationMinutes: true,
  calculatorEnabled: true,
  fullscreenRequired: true,
  maxViolations: true,
  status: true,
  resultPolicy: true,
  programId: true,
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
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { userId: ctx.userId, instituteId: ctx.instituteId };
  }

  async create(dto: CreateExamDto) {
    const { userId, instituteId } = this.ctx();
    if (dto.programId) {
      const program = await this.prisma.program.findFirst({
        where: { id: dto.programId, instituteId },
      });
      if (!program) throw new NotFoundException('Program not found');
    }
    return this.prisma.exam.create({
      data: {
        instituteId,
        title: dto.title,
        durationMinutes: dto.durationMinutes,
        instructions: dto.instructions,
        calculatorEnabled: dto.calculatorEnabled ?? false,
        fullscreenRequired: dto.fullscreenRequired ?? true,
        maxViolations: dto.maxViolations ?? 0,
        programId: dto.programId,
        resultPolicy: dto.resultPolicy ?? 'ON_PUBLISH',
        createdById: userId,
      },
      select: examSelect,
    });
  }

  findAll() {
    return this.prisma.exam.findMany({
      where: { instituteId: this.ctx().instituteId },
      orderBy: { createdAt: 'desc' },
      select: {
        ...examSelect,
        _count: { select: { sections: true, questions: true, batches: true } },
      },
    });
  }

  async findOne(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, instituteId: this.ctx().instituteId },
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
        instructions: dto.instructions,
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

  async schedule(examId: string, dto: ScheduleExamDto) {
    await this.getOwned(examId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
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
    // An exam must clear review before it can go live. DRAFT is still accepted
    // so an admin authoring their own paper isn't forced to review themselves.
    if (
      exam.status !== ExamStatus.DRAFT &&
      exam.status !== ExamStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Only draft or approved exams can be published',
      );
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
    const { instituteId } = this.ctx();

    const [exam, reviewer] = await Promise.all([
      this.prisma.exam.findFirst({
        where: { id: examId, instituteId },
        select: {
          id: true,
          status: true,
          _count: { select: { sections: true, questions: true } },
        },
      }),
      this.prisma.user.findFirst({
        where: { id: reviewerId, instituteId, role: 'ADMIN' },
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
    const { userId } = this.ctx();
    const exam = await this.getOwned(examId);
    if (exam.status !== ExamStatus.REVIEW) {
      throw new BadRequestException('Only exams under review can be approved');
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
    const exam = await this.getOwned(examId);
    if (exam.status !== ExamStatus.REVIEW) {
      throw new BadRequestException('Only exams under review can be rejected');
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
    return this.prisma.exam.update({
      where: { id: examId },
      data: { status: 'DRAFT' },
      select: examSelect,
    });
  }

  private async getOwned(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, instituteId: this.ctx().instituteId },
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
