import { ForbiddenException, Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';

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

  /** Most recent runs for this tenant. */
  list() {
    const { instituteId } = this.ctx();
    return this.prisma.importRun.findMany({
      where: { instituteId },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
    });
  }
}
