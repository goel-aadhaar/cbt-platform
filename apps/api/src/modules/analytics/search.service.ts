import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';

/** One hit, flattened so the client can render a single mixed list. */
export interface SearchHit {
  type: 'student' | 'exam' | 'question';
  id: string;
  /** Primary line — the student's name, the exam title, the question stem. */
  title: string;
  /** Secondary line: roll number, exam status, question subject/status. */
  subtitle: string;
  /** Where the console should navigate for this hit. */
  href: string;
}

/** Per-type cap, so one noisy type cannot crowd out the others. */
const PER_TYPE = 5;

/**
 * Cross-entity console search (§ admin navigation).
 *
 * Deliberately NOT a new search engine: it reuses the same tenant-scoped
 * Prisma predicates each module already applies, so a hit can never appear
 * here that the caller could not open. Teacher callers are additionally
 * narrowed to their own batches for students, matching TeacherScopeService
 * everywhere else.
 *
 * Out of scope by the UAT: semantic/vector/LaTeX-aware search. This is a plain
 * case-insensitive contains match.
 */
@Injectable()
export class SearchService {
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

  async search(rawTerm: string): Promise<{ term: string; hits: SearchHit[] }> {
    const term = rawTerm.trim();
    // Single characters match almost everything; not worth a round trip.
    if (term.length < 2) return { term, hits: [] };

    const instituteId = this.instituteId();
    const contains = { contains: term, mode: 'insensitive' as const };
    const batchScope = await this.teacherScope.myBatchIds();

    const [students, exams, questions] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          instituteId,
          ...(batchScope && { batchId: { in: batchScope } }),
          OR: [
            { rollNumber: contains },
            { user: { name: contains } },
            { user: { email: contains } },
          ],
        },
        select: {
          id: true,
          rollNumber: true,
          user: { select: { name: true } },
          batch: { select: { name: true } },
        },
        take: PER_TYPE,
        orderBy: { rollNumber: 'asc' },
      }),
      this.prisma.exam.findMany({
        where: { instituteId, title: contains },
        select: { id: true, title: true, status: true },
        take: PER_TYPE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.question.findMany({
        where: { instituteId, statement: contains },
        select: { id: true, statement: true, subject: true, status: true },
        take: PER_TYPE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const hits: SearchHit[] = [
      ...students.map((s) => ({
        type: 'student' as const,
        id: s.id,
        title: s.user.name,
        subtitle: `${s.rollNumber}${s.batch ? ` · ${s.batch.name}` : ''}`,
        href: `/admin/students?search=${encodeURIComponent(s.rollNumber)}`,
      })),
      ...exams.map((e) => ({
        type: 'exam' as const,
        id: e.id,
        title: e.title,
        subtitle: String(e.status),
        href: `/admin/exams?exam=${e.id}`,
      })),
      ...questions.map((q) => ({
        type: 'question' as const,
        id: q.id,
        // Stems can be long; the dropdown shows one line.
        title:
          q.statement.length > 90
            ? `${q.statement.slice(0, 90)}…`
            : q.statement,
        subtitle: `${q.subject} · ${q.status}`,
        href: `/admin/questions?search=${encodeURIComponent(term)}`,
      })),
    ];

    return { term, hits };
  }
}
