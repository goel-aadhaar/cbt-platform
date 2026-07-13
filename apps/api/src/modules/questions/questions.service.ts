import {
  BadRequestException,
  ConflictException,
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
import {
  ParsedQuestion,
  QuestionImportPort,
} from './ports/question-import.port';
import { QuestionSearchPort } from './ports/question-search.port';
import { Difficulty, QuestionStatus, QuestionType } from './question.types';

/** Defaults applied to a DOCX import when a question omits the field (§2.4). */
export interface DocxDefaults {
  subject?: string;
  chapter?: string;
  difficulty?: string;
  type?: string;
  examType?: string;
}

/** Result of a bulk DOCX question import (§2.4). */
export interface DocxImportSummary {
  total: number;
  imported: { index: number; id: string; type: string; statement: string }[];
  failed: { index: number; statement: string; reason: string }[];
}

const MAX_IMPORT_QUESTIONS = 500;

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
    // Platform ports (§2.6) — swapping an adapter needs no change here.
    private readonly search: QuestionSearchPort,
    private readonly importer: QuestionImportPort,
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

  /**
   * Bulk-import questions from a .docx (§2.4). Each parsed block becomes a DRAFT
   * question through the normal {@link create} path (so content validation and
   * the lifecycle apply). Per-question fault-tolerant: a bad block is reported
   * in `failed` without aborting the rest. Missing fields fall back to defaults.
   */
  async importDocx(
    buffer: Buffer,
    defaults: DocxDefaults,
  ): Promise<DocxImportSummary> {
    this.ctx(); // ensure tenant context (also enforced by create())

    // Parse via the Import port (§2.6) — the DOCX adapter today.
    const parsed = await this.importer.parse(buffer);
    if (parsed.length === 0) {
      throw new BadRequestException(
        'No questions found — each must start with "Q:" or a number (e.g. "1.")',
      );
    }
    if (parsed.length > MAX_IMPORT_QUESTIONS) {
      throw new BadRequestException(
        `Import is limited to ${MAX_IMPORT_QUESTIONS} questions at a time`,
      );
    }

    const imported: DocxImportSummary['imported'] = [];
    const failed: DocxImportSummary['failed'] = [];

    let index = 0;
    for (const block of parsed) {
      index++;
      try {
        const dto = resolveDraft(block, defaults);
        const created = await this.create(dto);
        imported.push({
          index,
          id: created.id,
          type: dto.type,
          statement: block.statement.slice(0, 80),
        });
      } catch (err) {
        failed.push({
          index,
          statement: block.statement.slice(0, 80),
          reason: err instanceof Error ? err.message : 'Failed',
        });
      }
    }

    return { total: parsed.length, imported, failed };
  }

  async findAll(query: QueryQuestionsDto) {
    const { instituteId } = this.ctx();
    const structuralWhere: Prisma.QuestionWhereInput = {
      instituteId,
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.chapter ? { chapter: query.chapter } : {}),
      ...(query.topic ? { topic: query.topic } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.examType ? { examType: query.examType } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };

    const term = query.search?.trim();
    if (!term) {
      return this.prisma.question.findMany({
        where: structuralWhere,
        orderBy: { createdAt: 'desc' },
        select: listSelect,
      });
    }

    // Search via the Search port (§2.6) — relevance-ranked ids — then hydrate
    // the rows through Prisma (applying the structural filters) and restore the
    // relevance order.
    const rankedIds = await this.search.search({ instituteId, term });
    if (rankedIds.length === 0) return [];

    const rows = await this.prisma.question.findMany({
      where: { ...structuralWhere, id: { in: rankedIds } },
      select: listSelect,
    });
    const order = new Map(rankedIds.map((id, i) => [id, i]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
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

    // Edit safeguard (§2.5): a question already used in an examination cannot be
    // silently changed — the caller must confirm, and is told which exams are
    // affected so each can be remediated (bonus / dropped / manual evaluation).
    if (!dto.confirm) {
      const usedIn = await this.prisma.examQuestion.findMany({
        where: { questionId: id },
        select: {
          exam: { select: { id: true, title: true, status: true } },
        },
      });
      if (usedIn.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'QuestionUsedInExams',
          message:
            'This question has already been used in exams. Continue? Re-send with confirm=true, then remediate each affected exam.',
          affectedExams: usedIn.map((u) => u.exam),
        });
      }
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

/**
 * Resolve a parsed DOCX block into a CreateQuestionDto (§2.4), applying import
 * defaults and inferring the type when not stated. Throws with a human reason
 * on missing/invalid fields so the importer can report the row as failed.
 */
function resolveDraft(
  parsed: ParsedQuestion,
  defaults: DocxDefaults,
): CreateQuestionDto {
  const subject = (parsed.meta.subject ?? defaults.subject ?? '').trim();
  const chapter = (parsed.meta.chapter ?? defaults.chapter ?? '').trim();
  const examType = (parsed.meta.examtype ?? defaults.examType ?? '').trim();
  if (!subject) throw new Error('Missing subject');
  if (!chapter) throw new Error('Missing chapter');
  if (!examType) throw new Error('Missing examType');
  if (!parsed.answer) throw new Error('Missing answer');

  const difficultyRaw = (
    parsed.meta.difficulty ??
    defaults.difficulty ??
    'MEDIUM'
  ).toUpperCase();
  if (!(Object.values(Difficulty) as string[]).includes(difficultyRaw)) {
    throw new Error(`Invalid difficulty "${difficultyRaw}"`);
  }
  const difficulty = difficultyRaw as Difficulty;

  const answerKeys = parsed.answer
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((k) => k.toUpperCase());
  const typeRaw = (parsed.meta.type ?? defaults.type ?? '').toUpperCase();
  let type: QuestionType;
  if ((Object.values(QuestionType) as string[]).includes(typeRaw)) {
    type = typeRaw as QuestionType;
  } else if (parsed.options.length === 0) {
    type = QuestionType.INTEGER;
  } else if (answerKeys.length > 1) {
    type = QuestionType.MSQ;
  } else {
    type = QuestionType.MCQ;
  }

  let answerKey: string | number | string[];
  let options: { key: string; text: string }[] | undefined;
  if (type === QuestionType.INTEGER) {
    const n = Number(parsed.answer.trim());
    if (Number.isNaN(n)) {
      throw new Error(`INTEGER answer "${parsed.answer}" is not a number`);
    }
    answerKey = n;
    options = undefined;
  } else {
    options = parsed.options;
    answerKey = type === QuestionType.MSQ ? answerKeys : (answerKeys[0] ?? '');
  }

  const tags = parsed.meta.tags
    ? parsed.meta.tags
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;
  const marks = toNumber(parsed.meta.marks);
  const negativeMarks = toNumber(parsed.meta.negativemarks);

  return {
    subject,
    chapter,
    topic: parsed.meta.topic,
    difficulty,
    type,
    language: parsed.meta.language,
    examType,
    tags,
    statement: parsed.statement,
    options,
    answerKey,
    explanation: parsed.meta.explanation,
    marks,
    negativeMarks,
  };
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
