import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { isCorrect } from '../results/scoring';
import { CheckAnswerDto, QueryPracticeDto } from './dto/practice.dto';

/**
 * Student-facing practice library (§2.4).
 *
 * Serves only questions a teacher has explicitly curated into the library
 * (`inPracticeLibrary`) AND that are APPROVED — never the whole bank.
 *
 * SECURITY: the select below deliberately omits `answerKey` and `explanation`.
 * A practice question may also be used in a live exam, so shipping its key to
 * the browser would leak exam answers. Grading therefore happens server-side via
 * `check()`, which returns the key only after the student has committed an
 * answer for that question.
 */
const practiceSelect = {
  id: true,
  subject: true,
  chapter: true,
  topic: true,
  difficulty: true,
  type: true,
  statement: true,
  options: true,
  marks: true,
  negativeMarks: true,
} satisfies Prisma.QuestionSelect;

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.get()?.instituteId;
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  /** Base scope: this tenant's curated, approved, active practice questions. */
  private scope(): Prisma.QuestionWhereInput {
    return {
      instituteId: this.instituteId(),
      inPracticeLibrary: true,
      status: 'APPROVED',
      isActive: true,
    };
  }

  /**
   * Subjects → chapters → topics available to drill, with counts, so the
   * practice UI can build its pickers without pulling every question.
   */
  async facets() {
    const rows = await this.prisma.question.findMany({
      where: this.scope(),
      select: { subject: true, chapter: true, topic: true, difficulty: true },
    });

    const subjects = new Map<
      string,
      { subject: string; count: number; chapters: Map<string, Set<string>> }
    >();
    const difficulties: Record<string, number> = {};

    for (const r of rows) {
      difficulties[r.difficulty] = (difficulties[r.difficulty] ?? 0) + 1;
      const entry = subjects.get(r.subject) ?? {
        subject: r.subject,
        count: 0,
        chapters: new Map<string, Set<string>>(),
      };
      entry.count += 1;
      const topics = entry.chapters.get(r.chapter) ?? new Set<string>();
      if (r.topic) topics.add(r.topic);
      entry.chapters.set(r.chapter, topics);
      subjects.set(r.subject, entry);
    }

    return {
      total: rows.length,
      difficulties,
      subjects: [...subjects.values()]
        .map((s) => ({
          subject: s.subject,
          count: s.count,
          chapters: [...s.chapters.entries()]
            .map(([chapter, topics]) => ({
              chapter,
              topics: [...topics].sort(),
            }))
            .sort((a, b) => a.chapter.localeCompare(b.chapter)),
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject)),
    };
  }

  /** A practice set matching the student's filters (answer keys withheld). */
  async questions(query: QueryPracticeDto) {
    const items = await this.prisma.question.findMany({
      where: {
        ...this.scope(),
        ...(query.subject ? { subject: query.subject } : {}),
        ...(query.chapter ? { chapter: query.chapter } : {}),
        ...(query.topic ? { topic: query.topic } : {}),
        ...(query.difficulty ? { difficulty: query.difficulty } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
      },
      select: practiceSelect,
      take: Math.min(query.limit ?? 25, 50),
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  /**
   * Grade one committed answer and reveal the key + explanation for THAT
   * question only. Scored with the same `isCorrect` used by exam evaluation, so
   * practice feedback can never disagree with real marking.
   */
  async check(dto: CheckAnswerDto) {
    const question = await this.prisma.question.findFirst({
      where: { ...this.scope(), id: dto.questionId },
      select: {
        id: true,
        type: true,
        answerKey: true,
        explanation: true,
        marks: true,
      },
    });
    if (!question) {
      throw new NotFoundException('Question is not in the practice library');
    }

    const correct = isCorrect(question.type, dto.answer, question.answerKey);

    return {
      questionId: question.id,
      correct,
      correctAnswer: question.answerKey,
      explanation: question.explanation,
      marks: correct ? question.marks : 0,
    };
  }
}
