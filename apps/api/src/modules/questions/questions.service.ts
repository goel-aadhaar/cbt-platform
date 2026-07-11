import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '../auth/auth.types';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionStatus, QuestionType } from './question.types';

const listSelect = {
  id: true,
  subject: true,
  chapter: true,
  topic: true,
  difficulty: true,
  type: true,
  language: true,
  examType: true,
  tags: true,
  marks: true,
  negativeMarks: true,
  status: true,
  isActive: true,
  statement: true,
  createdAt: true,
} satisfies Prisma.QuestionSelect;

const detailSelect = {
  ...listSelect,
  options: true,
  answerKey: true,
  explanation: true,
  mediaKeys: true,
  editedAt: true,
  approvedAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.QuestionSelect;

/**
 * Question bank (§2.4) with the lifecycle from §2.5. Tenant-scoped. Teachers
 * author (DRAFT) and submit; admins approve/reject/archive. Only APPROVED
 * questions are eligible for exams (enforced later by the exam builder).
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { userId: ctx.userId, role: ctx.role, instituteId: ctx.instituteId };
  }

  async create(dto: CreateQuestionDto) {
    const { userId, instituteId } = this.ctx();
    this.validateContent(dto.type, dto.options, dto.answerKey);

    return this.prisma.question.create({
      data: {
        instituteId,
        subject: dto.subject,
        chapter: dto.chapter,
        topic: dto.topic,
        difficulty: dto.difficulty,
        type: dto.type,
        language: dto.language ?? 'en',
        examType: dto.examType,
        tags: dto.tags ?? [],
        statement: dto.statement,
        options: dto.options as unknown as Prisma.InputJsonValue,
        answerKey: dto.answerKey,
        explanation: dto.explanation,
        marks: dto.marks ?? 4,
        negativeMarks: dto.negativeMarks ?? 1,
        mediaKeys: dto.mediaKeys ?? [],
        status: QuestionStatus.DRAFT,
        createdById: userId,
      },
      select: detailSelect,
    });
  }

  findAll(query: QueryQuestionsDto) {
    const { instituteId } = this.ctx();
    return this.prisma.question.findMany({
      where: {
        instituteId,
        ...(query.subject ? { subject: query.subject } : {}),
        ...(query.chapter ? { chapter: query.chapter } : {}),
        ...(query.topic ? { topic: query.topic } : {}),
        ...(query.difficulty ? { difficulty: query.difficulty } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.examType ? { examType: query.examType } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.search
          ? { statement: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: listSelect,
    });
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findFirst({
      where: { id, instituteId: this.ctx().instituteId },
      select: detailSelect,
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const { userId, role } = this.ctx();
    const existing = await this.getOwned(id);

    if (existing.status === QuestionStatus.ARCHIVED) {
      throw new BadRequestException('Archived questions cannot be edited');
    }
    const isAdmin = role === Role.ADMIN;
    const isAuthorDraft =
      existing.createdById === userId &&
      existing.status === QuestionStatus.DRAFT;
    if (!isAdmin && !isAuthorDraft) {
      throw new ForbiddenException(
        'You can only edit your own draft questions',
      );
    }

    // Re-validate content against the merged type/options/answerKey.
    this.validateContent(
      dto.type ?? existing.type,
      dto.options ?? existing.options,
      dto.answerKey ?? existing.answerKey,
    );

    return this.prisma.question.update({
      where: { id },
      data: {
        subject: dto.subject,
        chapter: dto.chapter,
        topic: dto.topic,
        difficulty: dto.difficulty,
        type: dto.type,
        language: dto.language,
        examType: dto.examType,
        tags: dto.tags,
        statement: dto.statement,
        options: dto.options as unknown as Prisma.InputJsonValue,
        answerKey: dto.answerKey,
        explanation: dto.explanation,
        marks: dto.marks,
        negativeMarks: dto.negativeMarks,
        mediaKeys: dto.mediaKeys,
        editedById: userId,
        editedAt: new Date(),
      },
      select: detailSelect,
    });
  }

  async submit(id: string) {
    const { userId, role } = this.ctx();
    const question = await this.getOwned(id);
    if (question.status !== QuestionStatus.DRAFT) {
      throw new BadRequestException('Only draft questions can be submitted');
    }
    if (role !== Role.ADMIN && question.createdById !== userId) {
      throw new ForbiddenException('Only the author can submit this question');
    }
    return this.setStatus(id, QuestionStatus.REVIEW);
  }

  async approve(id: string) {
    const { userId } = this.ctx();
    const question = await this.getOwned(id);
    if (question.status !== QuestionStatus.REVIEW) {
      throw new BadRequestException('Only questions in review can be approved');
    }
    return this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
      select: detailSelect,
    });
  }

  async reject(id: string) {
    const question = await this.getOwned(id);
    if (question.status !== QuestionStatus.REVIEW) {
      throw new BadRequestException('Only questions in review can be rejected');
    }
    return this.setStatus(id, QuestionStatus.DRAFT);
  }

  async archive(id: string) {
    await this.getOwned(id);
    return this.prisma.question.update({
      where: { id },
      data: { status: QuestionStatus.ARCHIVED, isActive: false },
      select: detailSelect,
    });
  }

  private setStatus(id: string, status: QuestionStatus) {
    return this.prisma.question.update({
      where: { id },
      data: { status },
      select: detailSelect,
    });
  }

  private async getOwned(id: string) {
    const question = await this.prisma.question.findFirst({
      where: { id, instituteId: this.ctx().instituteId },
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  /** Validates options/answerKey shape against the question type. */
  private validateContent(
    type: QuestionType,
    options: unknown,
    answerKey: unknown,
  ): void {
    if (type === QuestionType.INTEGER) {
      if (typeof answerKey !== 'number') {
        throw new BadRequestException('INTEGER answerKey must be a number');
      }
      return;
    }

    if (!Array.isArray(options) || options.length < 2) {
      throw new BadRequestException('MCQ/MSQ require at least 2 options');
    }
    const keys = new Set(
      options.map((o) => (o as { key?: unknown }).key).filter(Boolean),
    );

    if (type === QuestionType.MCQ) {
      if (typeof answerKey !== 'string' || !keys.has(answerKey)) {
        throw new BadRequestException(
          'MCQ answerKey must be a single valid option key',
        );
      }
    } else {
      const ok =
        Array.isArray(answerKey) &&
        answerKey.length > 0 &&
        answerKey.every((k) => typeof k === 'string' && keys.has(k));
      if (!ok) {
        throw new BadRequestException(
          'MSQ answerKey must be a non-empty list of valid option keys',
        );
      }
    }
  }
}
