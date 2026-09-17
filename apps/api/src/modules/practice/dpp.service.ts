import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateDppDto, QueryDppDto, UpdateDppDto } from './dto/dpp.dto';

/**
 * Daily Practice Papers (§ Product Structure): named, teacher-curated sets of
 * questions assembled directly from the central Question Bank and shared with
 * batches. No exam engine underneath — no sections, no marking scheme, no
 * approval workflow, no proctoring. Only the batch-assignment idiom is
 * borrowed (mirrors ExamBatch/ResourceBatch exactly), and questions are
 * referenced, never copied.
 */
const dppSelect = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  createdAt: true,
  subject: { select: { id: true, name: true } },
  chapter: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  batches: { select: { batch: { select: { id: true, name: true } } } },
  _count: { select: { questions: true } },
} satisfies Prisma.DppSelect;

@Injectable()
export class DppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { instituteId: ctx.instituteId, userId: ctx.userId, role: ctx.role };
  }

  /**
   * What a teacher/admin caller may see: an admin sees the whole institute;
   * a teacher sees a DPP they authored, or one shared with at least one of
   * their own batches — same shape as ExamsService.visibilityWhere().
   */
  private async visibilityWhere(): Promise<Prisma.DppWhereInput> {
    const { instituteId, userId } = this.ctx();
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

  private shape<
    T extends { batches: { batch: { id: string; name: string } }[] },
  >(row: T) {
    return { ...row, batches: row.batches.map((b) => b.batch) };
  }

  async list(query: QueryDppDto) {
    const rows = await this.prisma.dpp.findMany({
      where: {
        AND: [
          await this.visibilityWhere(),
          query.subjectId ? { subjectId: query.subjectId } : {},
        ],
      },
      select: dppSelect,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.shape(r));
  }

  async findOne(id: string) {
    const row = await this.prisma.dpp.findFirst({
      where: { AND: [await this.visibilityWhere(), { id }] },
      select: {
        ...dppSelect,
        questions: {
          orderBy: { order: 'asc' },
          select: {
            order: true,
            question: {
              select: {
                id: true,
                statement: true,
                subject: true,
                chapter: true,
                topic: true,
                difficulty: true,
                type: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('DPP not found');
    return this.shape(row);
  }

  async create(dto: CreateDppDto) {
    const { instituteId, userId } = this.ctx();
    const questionIds = [...new Set(dto.questionIds)];
    const batchIds = [...new Set(dto.batchIds)];

    await this.assertCanPublishTo(batchIds, instituteId);
    await this.assertQuestions(questionIds, instituteId);
    if (dto.subjectId || dto.chapterId) {
      await this.assertHierarchy(dto.subjectId, dto.chapterId, instituteId);
    }

    const created = await this.prisma.dpp.create({
      data: {
        instituteId,
        createdById: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        subjectId: dto.subjectId,
        chapterId: dto.chapterId,
        questions: {
          create: questionIds.map((questionId, order) => ({
            questionId,
            instituteId,
            order,
          })),
        },
        batches: {
          create: batchIds.map((batchId) => ({ batchId, instituteId })),
        },
      },
      select: dppSelect,
    });
    return this.shape(created);
  }

  async update(id: string, dto: UpdateDppDto) {
    const { instituteId } = this.ctx();
    const existing = await this.requireOwn(id, instituteId);

    const batchIds = dto.batchIds ? [...new Set(dto.batchIds)] : undefined;
    if (batchIds) await this.assertCanPublishTo(batchIds, instituteId);

    const questionIds = dto.questionIds
      ? [...new Set(dto.questionIds)]
      : undefined;
    if (questionIds) await this.assertQuestions(questionIds, instituteId);

    const subjectId = dto.subjectId ?? existing.subjectId ?? undefined;
    const chapterId = dto.chapterId ?? existing.chapterId ?? undefined;
    if (dto.subjectId !== undefined || dto.chapterId !== undefined) {
      if (subjectId || chapterId) {
        await this.assertHierarchy(subjectId, chapterId, instituteId);
      }
    }

    const updated = await this.prisma.dpp.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.chapterId !== undefined ? { chapterId: dto.chapterId } : {}),
        ...(questionIds
          ? {
              questions: {
                deleteMany: {},
                create: questionIds.map((questionId, order) => ({
                  questionId,
                  instituteId,
                  order,
                })),
              },
            }
          : {}),
        ...(batchIds
          ? {
              batches: {
                deleteMany: {},
                create: batchIds.map((batchId) => ({ batchId, instituteId })),
              },
            }
          : {}),
      },
      select: dppSelect,
    });
    return this.shape(updated);
  }

  async remove(id: string) {
    const { instituteId } = this.ctx();
    await this.requireOwn(id, instituteId);
    await this.prisma.dpp.delete({ where: { id } });
    return { removed: id };
  }

  /* ------------------------------ helpers ------------------------------ */

  /** Every batch must exist here, and a teacher must actually teach it. */
  private async assertCanPublishTo(batchIds: string[], instituteId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: batchIds }, instituteId },
      select: { id: true, name: true },
    });
    if (batches.length !== batchIds.length) {
      throw new BadRequestException(
        'One or more of those batches does not exist in your institute. Reload and try again.',
      );
    }

    const mine = await this.teacherScope.myBatchIds();
    if (mine === null) return; // admin — institute-wide by definition

    const refused = batches.filter((b) => !mine.includes(b.id));
    if (refused.length > 0) {
      throw new ForbiddenException(
        `You do not teach ${refused.map((b) => b.name).join(', ')}, so you cannot assign a DPP to ` +
          `${refused.length > 1 ? 'them' : 'it'}. Ask an administrator to assign you to the batch first.`,
      );
    }
  }

  /** Every question must exist, belong to this institute, and be APPROVED —
   * a DPP is student-facing the moment it is created, so unreviewed content
   * can never reach it. */
  private async assertQuestions(questionIds: string[], instituteId: string) {
    const rows = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, instituteId },
      select: { id: true, status: true },
    });
    if (rows.length !== questionIds.length) {
      throw new BadRequestException(
        'One or more of those questions does not exist in your institute.',
      );
    }
    const unapproved = rows.filter((q) => q.status !== 'APPROVED');
    if (unapproved.length > 0) {
      throw new BadRequestException(
        `${unapproved.length} of the selected questions are not APPROVED yet — only approved questions can go into a DPP.`,
      );
    }
  }

  /** If both are given, the chapter must belong to the subject. */
  private async assertHierarchy(
    subjectId: string | undefined,
    chapterId: string | undefined,
    instituteId: string,
  ) {
    if (!chapterId) return;
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        instituteId,
        ...(subjectId ? { subjectId } : {}),
      },
      select: { id: true },
    });
    if (!chapter) {
      throw new BadRequestException(
        'That chapter does not belong to the chosen subject.',
      );
    }
  }

  /** Scoped lookup — a teacher cannot edit another batch's DPP. */
  private async requireOwn(id: string, instituteId: string) {
    const row = await this.prisma.dpp.findFirst({
      where: { AND: [await this.visibilityWhere(), { id, instituteId }] },
      select: { id: true, subjectId: true, chapterId: true },
    });
    if (!row) throw new NotFoundException('DPP not found');
    return row;
  }

  /* ------------------------------ student ------------------------------ */

  /**
   * Every DPP assigned to the calling student's own batch, grouped like the
   * Resources shelf: subject first, then the papers within it. Only ADMIN
   * has no student equivalent — this route is STUDENT-only, enforced at the
   * controller.
   */
  async listForMe() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const rows = await this.prisma.dpp.findMany({
      where: {
        instituteId: ctx.instituteId,
        isActive: true,
        batches: { some: { batchId: student.batchId } },
      },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        subject: { select: { id: true, name: true } },
        chapter: { select: { id: true, name: true } },
        _count: { select: { questions: true } },
        sessions: {
          where: { studentId: student.id },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            completedAt: true,
            answeredCount: true,
            correctCount: true,
            totalCount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      subject: r.subject,
      chapter: r.chapter,
      questionCount: r._count.questions,
      attempt: r.sessions[0]
        ? {
            sessionId: r.sessions[0].id,
            status: r.sessions[0].completedAt ? 'COMPLETED' : 'IN_PROGRESS',
            answered: r.sessions[0].answeredCount,
            correct: r.sessions[0].correctCount,
            total: r.sessions[0].totalCount,
          }
        : null,
    }));
  }
}
