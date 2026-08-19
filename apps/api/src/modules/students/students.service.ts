import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { csvRecords } from '../../common/csv/parse-csv';
import { PrismaService } from '../../database/prisma.service';
import { UserStatus } from '../auth/auth.types';
import { ImportsService } from '../imports/imports.service';
import { InvitationService } from '../auth/invitation/invitation.service';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

/** Result of a bulk CSV import (§2.10). */
export interface ImportSummary {
  batchId: string;
  batch: string;
  total: number;
  imported: { row: number; name: string; email: string; rollNumber: string }[];
  failed: { row: number; email: string; reason: string }[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_IMPORT_ROWS = 1000;

/**
 * Student management (contract §2.10), scoped to the caller's institute.
 * Students are *created* via the invitation flow; here admins list, view,
 * reassign batch, edit name, and deactivate them. A flattened view joins the
 * academic record (Student) with the auth record (User) and the batch.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly teacherScope: TeacherScopeService,
    private readonly invitations: InvitationService,
    private readonly imports: ImportsService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  /**
   * Bulk-import a batch's students from a CSV (§2.10). Columns: `name`,
   * `email` (required) — roll numbers are always server-generated
   * ({yy}{institute code}{sequence}, §2.11), never read from the file. Each
   * row is created through the normal invitation flow (PENDING → email link
   * → set password). Processing is per-row and fault-tolerant: a bad row is
   * reported in `failed` without aborting the rest.
   */
  async importCsv(params: {
    batchId: string;
    buffer: Buffer;
    invitedById: string;
    /** Original upload name, recorded in the import history. */
    fileName?: string;
  }): Promise<ImportSummary> {
    const instituteId = this.instituteId();
    const batch = await this.prisma.batch.findFirst({
      where: { id: params.batchId, instituteId },
      select: { id: true, name: true },
    });
    if (!batch) {
      throw new BadRequestException('Batch not found in your institute');
    }

    const records = csvRecords(params.buffer.toString('utf8'));
    if (records.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Import is limited to ${MAX_IMPORT_ROWS} rows at a time`,
      );
    }
    if (!('name' in records[0]) || !('email' in records[0])) {
      throw new BadRequestException('CSV must have "name" and "email" columns');
    }

    const seenEmails = new Set<string>();
    const imported: ImportSummary['imported'] = [];
    const failed: ImportSummary['failed'] = [];

    let rowNum = 1; // header occupies row 1; data begins at row 2
    for (const rec of records) {
      rowNum++;
      const name = rec.name;
      const email = rec.email.toLowerCase();
      try {
        if (!name) throw new Error('Missing name');
        if (!EMAIL_RE.test(email)) throw new Error('Invalid email');
        if (seenEmails.has(email)) {
          throw new Error('Duplicate email in file');
        }

        // inviteStudent() generates the roll number itself and, row-by-row
        // sequential awaiting here, always sees every prior row's write —
        // no risk of two rows in the same file computing the same one.
        const invited = await this.invitations.inviteStudent(
          instituteId,
          params.invitedById,
          { name, email, batchId: batch.id },
        );

        seenEmails.add(email);
        imported.push({
          row: rowNum,
          name,
          email,
          rollNumber: invited.rollNumber ?? '',
        });
      } catch (err) {
        failed.push({
          row: rowNum,
          email,
          reason: err instanceof Error ? err.message : 'Failed',
        });
      }
    }

    // Best-effort history: never let logging fail an import that succeeded.
    await this.imports.record({
      kind: 'STUDENTS_CSV',
      fileName: params.fileName ?? 'students.csv',
      total: records.length,
      imported: imported.length,
      failures: failed,
      target: `Batch: ${batch.name}`,
    });

    return {
      batchId: batch.id,
      batch: batch.name,
      total: records.length,
      imported,
      failed,
    };
  }

  /**
   * Roster listing — always paginated. An institute's roll can run to thousands
   * of students (they are bulk-imported by CSV), so an uncapped findMany would
   * serialise the entire roll into a single response.
   */
  async findAll(query: QueryStudentsDto) {
    const scope = await this.teacherScope.myBatchIds();
    // Intersect the caller's own batch filter (if any) with their teacher
    // scope (if any) rather than letting both conditions collide on the same
    // field — a batch outside scope yields an empty page, not a 500.
    const effectiveBatchIds =
      scope === null
        ? query.batchId
          ? [query.batchId]
          : undefined
        : query.batchId
          ? scope.includes(query.batchId)
            ? [query.batchId]
            : []
          : scope;

    const where = {
      instituteId: this.instituteId(),
      ...(effectiveBatchIds && { batchId: { in: effectiveBatchIds } }),
    };
    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;

    const [students, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          rollNumber: true,
          createdAt: true,
          user: { select: { name: true, email: true, status: true } },
          batch: { select: { id: true, name: true } },
        },
        orderBy: { rollNumber: 'asc' },
        take,
        skip,
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      items: students.map((s) => ({
        id: s.id,
        rollNumber: s.rollNumber,
        name: s.user.name,
        email: s.user.email,
        status: s.user.status,
        batch: s.batch,
        createdAt: s.createdAt,
      })),
      total,
      limit: take,
      offset: skip,
    };
  }

  async findOne(id: string) {
    const scope = await this.teacherScope.myBatchIds();
    const s = await this.prisma.student.findFirst({
      where: {
        id,
        instituteId: this.instituteId(),
        ...(scope && { batchId: { in: scope } }),
      },
      select: {
        id: true,
        rollNumber: true,
        createdAt: true,
        user: { select: { name: true, email: true, status: true } },
        batch: { select: { id: true, name: true } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    return {
      id: s.id,
      rollNumber: s.rollNumber,
      name: s.user.name,
      email: s.user.email,
      status: s.user.status,
      batch: s.batch,
      createdAt: s.createdAt,
    };
  }

  async update(id: string, dto: UpdateStudentDto) {
    const owned = await this.getOwned(id);

    if (dto.batchId !== undefined && dto.batchId !== owned.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: dto.batchId, instituteId: this.instituteId() },
      });
      if (!batch) {
        throw new BadRequestException('Batch not found in your institute');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await tx.user.update({
          where: { id: owned.userId },
          data: { name: dto.name },
        });
      }
      if (dto.batchId !== undefined) {
        await tx.student.update({
          where: { id },
          data: { batchId: dto.batchId },
        });
      }
    });

    return this.findOne(id);
  }

  /** Soft-delete: disables the student's account (contract §2.10 "delete"). */
  async deactivate(id: string) {
    const owned = await this.getOwned(id);
    await this.prisma.user.update({
      where: { id: owned.userId },
      data: { status: UserStatus.DISABLED },
    });
    return this.findOne(id);
  }

  /** Undoes a deactivation. Refuses a PENDING/ACTIVE student — there is no
   * disabled state to lift, so "reactivate" would be a confusing no-op. */
  async reactivate(id: string) {
    const owned = await this.getOwned(id);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: owned.userId },
      select: { status: true },
    });
    if (user.status !== UserStatus.DISABLED) {
      throw new BadRequestException(
        'Only a deactivated student can be reactivated',
      );
    }
    await this.prisma.user.update({
      where: { id: owned.userId },
      data: { status: UserStatus.ACTIVE },
    });
    return this.findOne(id);
  }

  /** Re-sends the activation email for a student still awaiting one. */
  async resendInvite(id: string) {
    const owned = await this.getOwned(id);
    await this.invitations.resendInvite(owned.userId, this.instituteId());
    return this.findOne(id);
  }

  private async getOwned(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: { id: true, userId: true, batchId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}
