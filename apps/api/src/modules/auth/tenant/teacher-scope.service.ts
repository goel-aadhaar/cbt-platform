import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { Role } from '../auth.types';
import { TenantContextService } from './tenant-context.service';

/**
 * A TEACHER's visibility is restricted to the batches they're assigned
 * (TeacherBatch) — not a contract requirement (the original agreement never
 * distinguishes ADMIN from TEACHER), but a product decision made once the
 * two roles were split. Standalone rather than folded into
 * TenantContextData/its interceptor: that runs on every authenticated
 * request with zero DB calls today, and only a handful of read-paths
 * (exams, students, results, analytics, monitoring) need this lookup.
 */
@Injectable()
export class TeacherScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Batch ids the current session may see.
   *
   * `null` = unrestricted (not currently acting as TEACHER). `[]` = a
   * TEACHER assigned to zero batches — must mean "sees nothing", so every
   * caller MUST treat `[]` as a real (empty) filter, never as falsy/absent.
   */
  async myBatchIds(): Promise<string[] | null> {
    const ctx = this.tenant.get();
    if (!ctx || ctx.role !== Role.TEACHER) return null;
    const rows = await this.prisma.teacherBatch.findMany({
      where: {
        teacherId: ctx.userId,
        instituteId: ctx.instituteId ?? undefined,
      },
      select: { batchId: true },
    });
    return rows.map((r) => r.batchId);
  }
}
