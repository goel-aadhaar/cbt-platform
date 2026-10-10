import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '../auth/auth.types';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryImportsDto } from './dto/query-imports.dto';
import { buildImportWarnings } from './import-warnings';

const DEFAULT_IMPORTS_PAGE_SIZE = 50;

/**
 * Import history.
 *
 * `record` is called by the student-CSV and question-docx importers after they
 * finish. It is deliberately best-effort: a failure to WRITE THE LOG must never
 * fail an import that already succeeded, so callers do not await a rejection.
 */

/** Cap stored failures so one catastrophic upload can't bloat the table. */
const MAX_STORED_FAILURES = 100;

export type ImportKind = 'STUDENTS_CSV' | 'QUESTIONS_DOCX';

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      role: ctx.role,
    };
  }

  /**
   * Open a run BEFORE its rows are written, so each row can point back at it
   * (the review screen lists a run's questions by that link). Unlike `record`
   * this throws: an import whose rows cannot be tied to a run could not be
   * reviewed, so it is better refused than half-linked.
   */
  async start(params: {
    kind: ImportKind;
    fileName: string;
    total: number;
    target?: string | null;
  }): Promise<string> {
    const { instituteId, userId } = this.ctx();
    const run = await this.prisma.importRun.create({
      data: {
        instituteId,
        createdById: userId,
        kind: params.kind,
        fileName: params.fileName,
        totalRows: params.total,
        importedRows: 0,
        failedRows: 0,
        failures: [],
        target: params.target ?? null,
      },
      select: { id: true },
    });
    return run.id;
  }

  /** Record a started run's outcome. Best-effort, like `record`. */
  async finish(
    id: string,
    params: { imported: number; failures: unknown[] },
  ): Promise<void> {
    try {
      await this.prisma.importRun.update({
        where: { id },
        data: {
          importedRows: params.imported,
          failedRows: params.failures.length,
          failures: params.failures.slice(
            0,
            MAX_STORED_FAILURES,
          ) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Swallowed on purpose — see the class comment.
    }
  }

  /**
   * One run with its numbering warnings, for the post-upload review screen.
   * A teacher sees only their own runs; another institute's run is a 404.
   *
   * Warnings are derived from the stored rows rather than persisted (the
   * failures column stays a pure list of failures, which the Imports history
   * screen counts), so they always reflect what is in the bank now.
   */
  async get(id: string) {
    const { instituteId, userId, role } = this.ctx();
    const run = await this.prisma.importRun.findFirst({
      where: {
        id,
        instituteId,
        ...(role === Role.TEACHER ? { createdById: userId } : {}),
      },
      select: {
        id: true,
        kind: true,
        fileName: true,
        totalRows: true,
        importedRows: true,
        failedRows: true,
        failures: true,
        target: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!run) throw new NotFoundException('Import not found');

    const rows = await this.prisma.question.findMany({
      where: { importRunId: id, instituteId },
      select: { sourceSeq: true, sourceLabel: true },
    });
    const failures = Array.isArray(run.failures)
      ? (run.failures as { sourceSeq?: number; sourceLabel?: string }[])
      : [];
    const numbered = [...rows, ...failures]
      .filter((r) => typeof r.sourceSeq === 'number')
      .map((r) => ({ seq: r.sourceSeq as number, label: r.sourceLabel }));
    return { ...run, warnings: buildImportWarnings(numbered) };
  }

  /** Persist one import run. Never throws — logging is not worth losing data. */
  async record(params: {
    kind: ImportKind;
    fileName: string;
    total: number;
    imported: number;
    failures: unknown[];
    target?: string | null;
    /** Falls back to the tenant context when the caller has it to hand. */
    instituteId?: string;
    createdById?: string;
  }): Promise<void> {
    try {
      const ctx = this.tenant.get();
      const instituteId = params.instituteId ?? ctx?.instituteId;
      const createdById = params.createdById ?? ctx?.userId;
      if (!instituteId || !createdById) return;

      await this.prisma.importRun.create({
        data: {
          instituteId,
          createdById,
          kind: params.kind,
          fileName: params.fileName,
          totalRows: params.total,
          importedRows: params.imported,
          failedRows: params.failures.length,
          failures: params.failures.slice(
            0,
            MAX_STORED_FAILURES,
          ) as Prisma.InputJsonValue,
          target: params.target ?? null,
        },
      });
    } catch {
      // Swallowed on purpose — see the class comment.
    }
  }

  /** Runs for this tenant, newest first (§ pagination). */
  async list(query: QueryImportsDto = {}) {
    const { instituteId } = this.ctx();
    const where: Prisma.ImportRunWhereInput = { instituteId };
    const limit = query.limit ?? DEFAULT_IMPORTS_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.importRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          kind: true,
          fileName: true,
          totalRows: true,
          importedRows: true,
          failedRows: true,
          failures: true,
          target: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      }),
      this.prisma.importRun.count({ where }),
    ]);
    return { items, total, limit, offset };
  }
}
