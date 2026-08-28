import { ForbiddenException, Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryImportsDto } from './dto/query-imports.dto';

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
    return { instituteId: ctx.instituteId, userId: ctx.userId };
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
