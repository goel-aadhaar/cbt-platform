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
import { ImportsService } from '../imports/imports.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import {
  ParsedQuestion,
  QuestionImportPort,
} from './ports/question-import.port';
import { QuestionSearchPort } from './ports/question-search.port';
import { Difficulty, QuestionStatus, QuestionType } from './question.types';

/**
 * Defaults applied to every question in a DOCX import (§2.4) — unlike the
 * other fields, subject/chapter/exam-category are selected ONCE for the
 * whole file (via the import modal's cascading dropdowns) rather than
 * inferred per-row, since they must resolve to real taxonomy rows now.
 */
export interface DocxDefaults {
  subjectId?: string;
  chapterId?: string;
  difficulty?: string;
  type?: string;
  examCategoryId?: string;
}

/** Result of a bulk DOCX question import (§2.4). */
export interface DocxImportSummary {
  total: number;
  imported: { index: number; id: string; type: string; statement: string }[];
  failed: { index: number; statement: string; reason: string }[];
}

const MAX_IMPORT_QUESTIONS = 500;

/** Page size when a caller doesn't ask for one (§2.4 — the bank is large). */
const DEFAULT_PAGE_SIZE = 50;

const listSelect = {
  id: true,
  subject: true,
  chapter: true,
  topic: true,
  subjectId: true,
  chapterId: true,
  topicId: true,
  difficulty: true,
  type: true,
  language: true,
  examCategoryId: true,
  examCategory: { select: { id: true, name: true } },
  tags: true,
  marks: true,
  negativeMarks: true,
  status: true,
  isActive: true,
  statement: true,
  createdAt: true,
  // Practice-library membership — the exam builder shows this as a marker so a
  // teacher can see a question is already drillable before reusing it.
  inPracticeLibrary: true,
  practiceAddedAt: true,
  createdBy: { select: { id: true, name: true } },
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
    private readonly imports: ImportsService,
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
    const tax = await this.resolveTaxonomy(instituteId, {
      subjectId: dto.subjectId,
      chapterId: dto.chapterId,
      topicId: dto.topicId ?? undefined,
      examCategoryId: dto.examCategoryId ?? undefined,
    });

    return this.prisma.question.create({
      data: {
        instituteId,
        subject: tax.subjectName,
        chapter: tax.chapterName,
        topic: tax.topicName,
        subjectId: tax.subjectId,
        chapterId: tax.chapterId,
        topicId: tax.topicId,
        examCategoryId: tax.examCategoryId,
        difficulty: dto.difficulty,
        type: dto.type,
        language: dto.language ?? 'en',
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
   * Resolves subjectId/chapterId/topicId/examCategoryId against the real
   * taxonomy (§2.4), verifying each belongs to the caller's institute and
   * that chapter/topic actually nest under the given subject/chapter — the
   * same parent-ownership check ClassesService/BatchesService use. Returns
   * the resolved names too, since `subject`/`chapter`/`topic` on Question
   * stay denormalized for the generated search_vector column.
   */
  private async resolveTaxonomy(
    instituteId: string,
    input: {
      subjectId: string;
      chapterId: string;
      topicId?: string;
      examCategoryId?: string;
    },
  ): Promise<{
    subjectId: string;
    chapterId: string;
    topicId: string | null;
    examCategoryId: string | null;
    subjectName: string;
    chapterName: string;
    topicName: string | null;
  }> {
    const subject = await this.prisma.subject.findFirst({
      where: { id: input.subjectId, instituteId },
    });
    if (!subject) throw new BadRequestException('Subject not found');

    const chapter = await this.prisma.chapter.findFirst({
      where: { id: input.chapterId, instituteId, subjectId: subject.id },
    });
    if (!chapter) {
      throw new BadRequestException(
        'Chapter not found in the selected subject',
      );
    }

    let topic: { id: string; name: string } | null = null;
    if (input.topicId) {
      topic = await this.prisma.topic.findFirst({
        where: { id: input.topicId, instituteId, chapterId: chapter.id },
      });
      if (!topic) {
        throw new BadRequestException(
          'Topic not found in the selected chapter',
        );
      }
    }

    let examCategoryId: string | null = null;
    if (input.examCategoryId) {
      const category = await this.prisma.examCategory.findFirst({
        where: { id: input.examCategoryId, instituteId },
      });
      if (!category) throw new BadRequestException('Exam category not found');
      examCategoryId = category.id;
    }

    return {
      subjectId: subject.id,
      chapterId: chapter.id,
      topicId: topic?.id ?? null,
      examCategoryId,
      subjectName: subject.name,
      chapterName: chapter.name,
      topicName: topic?.name ?? null,
    };
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
    fileName = 'questions.docx',
  ): Promise<DocxImportSummary> {
    const { instituteId } = this.ctx(); // also enforced by create()
    if (!defaults.subjectId || !defaults.chapterId) {
      throw new BadRequestException(
        'Select a subject and chapter to import into',
      );
    }

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

    // Best-effort history: never let logging fail an import that succeeded.
    const [subject, chapter] = await Promise.all([
      this.prisma.subject.findFirst({
        where: { id: defaults.subjectId, instituteId },
        select: { name: true },
      }),
      this.prisma.chapter.findFirst({
        where: { id: defaults.chapterId, instituteId },
        select: { name: true },
      }),
    ]);
    await this.imports.record({
      kind: 'QUESTIONS_DOCX',
      fileName,
      total: parsed.length,
      imported: imported.length,
      failures: failed,
      target: `${subject?.name ?? 'Unknown subject'} · ${chapter?.name ?? 'Unknown chapter'}`,
    });

    return { total: parsed.length, imported, failed };
  }

  async findAll(query: QueryQuestionsDto) {
    const { instituteId, userId } = this.ctx();
    const structuralWhere: Prisma.QuestionWhereInput = {
      instituteId,
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.examCategoryId ? { examCategoryId: query.examCategoryId } : {}),
      ...(query.inPracticeLibrary !== undefined
        ? { inPracticeLibrary: query.inPracticeLibrary }
        : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.mine ? { createdById: userId } : {}),
    };

    /**
     * ALWAYS paginated, and always an envelope (§2.4). The bank is specified to
     * hold 20,000+ questions per institute, so an uncapped findMany would ship
     * the whole bank in one response; callers also need `total` to paginate.
     */
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;

    const term = query.search?.trim();
    if (!term) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.question.findMany({
          where: structuralWhere,
          orderBy: { createdAt: 'desc' },
          select: listSelect,
          take: limit,
          skip: offset,
        }),
        this.prisma.question.count({ where: structuralWhere }),
      ]);
      return { items, total, limit, offset };
    }

    // Search via the Search port (§2.6) — relevance-ranked ids — then hydrate
    // the rows through Prisma (applying the structural filters) and restore the
    // relevance order.
    const rankedIds = await this.search.search({ instituteId, term });
    if (rankedIds.length === 0) return { items: [], total: 0, limit, offset };

    const rows = await this.prisma.question.findMany({
      where: { ...structuralWhere, id: { in: rankedIds } },
      select: listSelect,
    });
    const order = new Map(rankedIds.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    // The structural filters can drop ranked ids, so the page is taken after
    // re-ordering rather than from the id list.
    return {
      items: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
    };
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
    const { userId, role, instituteId } = this.ctx();
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

    // Only re-resolve the taxonomy if the caller actually touched one of its
    // fields — otherwise leave subject/chapter/topic/examCategory untouched.
    const taxonomyChanged =
      dto.subjectId !== undefined ||
      dto.chapterId !== undefined ||
      dto.topicId !== undefined ||
      dto.examCategoryId !== undefined;
    // `dto.topicId`/`examCategoryId` are `string | null | undefined`: undefined
    // means "not sent, keep the existing value"; null means "clear it". A
    // plain `dto.topicId ?? existing.topicId` would conflate the two, since
    // `??` treats an explicit null the same as undefined.
    const nextTopicId =
      dto.topicId !== undefined
        ? (dto.topicId ?? undefined)
        : (existing.topicId ?? undefined);
    const nextExamCategoryId =
      dto.examCategoryId !== undefined
        ? (dto.examCategoryId ?? undefined)
        : (existing.examCategoryId ?? undefined);
    const tax = taxonomyChanged
      ? await this.resolveTaxonomy(instituteId, {
          subjectId: dto.subjectId ?? existing.subjectId,
          chapterId: dto.chapterId ?? existing.chapterId,
          topicId: nextTopicId,
          examCategoryId: nextExamCategoryId,
        })
      : null;

    return this.prisma.question.update({
      where: { id },
      data: {
        ...(tax && {
          subject: tax.subjectName,
          chapter: tax.chapterName,
          topic: tax.topicName,
          subjectId: tax.subjectId,
          chapterId: tax.chapterId,
          topicId: tax.topicId,
          examCategoryId: tax.examCategoryId,
        }),
        difficulty: dto.difficulty,
        type: dto.type,
        language: dto.language,
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

  /**
   * Add an APPROVED question to the practice library (§2.4).
   *
   * Deliberately NOT an approval-gated transition: curating practice content is
   * a teaching decision, so any teacher or admin may do it. Only APPROVED
   * questions qualify — students must never drill unreviewed content. A question
   * in the library can still be used in exams.
   */
  async addToPracticeLibrary(id: string) {
    const { userId } = this.ctx();
    const question = await this.getOwned(id);
    if (question.status !== QuestionStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved questions can be added to the practice library',
      );
    }
    if (question.inPracticeLibrary) return this.findOne(id);
    return this.prisma.question.update({
      where: { id },
      data: {
        inPracticeLibrary: true,
        practiceAddedById: userId,
        practiceAddedAt: new Date(),
      },
      select: detailSelect,
    });
  }

  /** Remove a question from the practice library (it stays in the bank). */
  async removeFromPracticeLibrary(id: string) {
    await this.getOwned(id);
    return this.prisma.question.update({
      where: { id },
      data: {
        inPracticeLibrary: false,
        practiceAddedById: null,
        practiceAddedAt: null,
      },
      select: detailSelect,
    });
  }

  async archive(id: string, confirm?: boolean) {
    const existing = await this.getOwned(id);
    if (existing.status === QuestionStatus.ARCHIVED) return this.findOne(id);

    // Same in-use safeguard as update() (§2.5): archiving is a silent
    // content change too — a teacher scanning "my exam's questions" would
    // find one quietly archived with no warning otherwise.
    if (!confirm) {
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
            'This question has already been used in exams. Continue? Re-send with confirm=true.',
          affectedExams: usedIn.map((u) => u.exam),
        });
      }
    }

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
 *
 * Subject/chapter/exam-category are NOT inferred per-block — they're selected
 * once for the whole file via `defaults` (importDocx already requires
 * subjectId/chapterId before parsing starts), since they must resolve to real
 * taxonomy rows rather than arbitrary text a .docx block happened to contain.
 */
function resolveDraft(
  parsed: ParsedQuestion,
  defaults: DocxDefaults,
): CreateQuestionDto {
  if (!defaults.subjectId) throw new Error('Missing subject');
  if (!defaults.chapterId) throw new Error('Missing chapter');
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
    subjectId: defaults.subjectId,
    chapterId: defaults.chapterId,
    difficulty,
    type,
    language: parsed.meta.language,
    examCategoryId: defaults.examCategoryId,
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
