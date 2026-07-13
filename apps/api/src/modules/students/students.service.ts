import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { csvRecords } from '../../common/csv/parse-csv';
import { PrismaService } from '../../database/prisma.service';
import { UserStatus } from '../auth/auth.types';
import { InvitationService } from '../auth/invitation/invitation.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { UpdateStudentDto } from './dto/update-student.dto';

/** Result of a bulk CSV import (§2.10). */
export interface ImportSummary {
  batchId: string;
  batch: string;
  rollPrefix: string;
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
    private readonly invitations: InvitationService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  /**
   * Bulk-import a batch's students from a CSV (§2.10). Columns: `name`, `email`
   * (required) and `rollNumber` (optional — auto-generated when blank). Each row
   * is created through the normal invitation flow (PENDING → email link → set
   * password). Processing is per-row and fault-tolerant: a bad row is reported
   * in `failed` without aborting the rest.
   */
  async importCsv(params: {
    batchId: string;
    buffer: Buffer;
    rollPrefix?: string;
    invitedById: string;
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

    // Roll-number generation: sequential, zero-padded, unique within institute.
    const existingRolls = (
      await this.prisma.student.findMany({
        where: { instituteId },
        select: { rollNumber: true },
      })
    ).map((s) => s.rollNumber);
    // Shared across explicit + generated rolls so neither collides with the
    // other, nor with rolls already in the institute.
    const seenRolls = new Set(existingRolls);
    const prefix = derivePrefix(params.rollPrefix, batch.name);
    const nextRoll = makeRollGenerator(prefix, seenRolls);

    const seenEmails = new Set<string>();
    const imported: ImportSummary['imported'] = [];
    const failed: ImportSummary['failed'] = [];

    let rowNum = 1; // header occupies row 1; data begins at row 2
    for (const rec of records) {
      rowNum++;
      const name = rec.name;
      const email = rec.email.toLowerCase();
      let roll = rec.rollnumber || rec['roll number'] || rec.roll || '';
      try {
        if (!name) throw new Error('Missing name');
        if (!EMAIL_RE.test(email)) throw new Error('Invalid email');
        if (seenEmails.has(email)) {
          throw new Error('Duplicate email in file');
        }
        if (roll) {
          if (seenRolls.has(roll)) throw new Error('Duplicate roll number');
        } else {
          roll = nextRoll();
        }

        await this.invitations.inviteStudent(instituteId, params.invitedById, {
          name,
          email,
          rollNumber: roll,
          batchId: batch.id,
        });

        seenEmails.add(email);
        seenRolls.add(roll);
        imported.push({ row: rowNum, name, email, rollNumber: roll });
      } catch (err) {
        failed.push({
          row: rowNum,
          email,
          reason: err instanceof Error ? err.message : 'Failed',
        });
      }
    }

    return {
      batchId: batch.id,
      batch: batch.name,
      rollPrefix: prefix,
      total: records.length,
      imported,
      failed,
    };
  }

  async findAll(batchId?: string) {
    const students = await this.prisma.student.findMany({
      where: {
        instituteId: this.instituteId(),
        ...(batchId ? { batchId } : {}),
      },
      select: {
        id: true,
        rollNumber: true,
        createdAt: true,
        user: { select: { name: true, email: true, status: true } },
        batch: { select: { id: true, name: true } },
      },
      orderBy: { rollNumber: 'asc' },
    });
    return students.map((s) => ({
      id: s.id,
      rollNumber: s.rollNumber,
      name: s.user.name,
      email: s.user.email,
      status: s.user.status,
      batch: s.batch,
      createdAt: s.createdAt,
    }));
  }

  async findOne(id: string) {
    const s = await this.prisma.student.findFirst({
      where: { id, instituteId: this.instituteId() },
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

  private async getOwned(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: { id: true, userId: true, batchId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}

/** Roll-number prefix: explicit override, else derived from the batch name. */
function derivePrefix(override: string | undefined, batchName: string): string {
  const explicit = override
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (explicit) return explicit;
  const fromBatch = batchName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  return fromBatch || 'STU';
}

/**
 * Returns a generator that yields the next free `<PREFIX><0000>` roll number,
 * starting after the highest existing sequence for that prefix. The `taken` set
 * is read and updated in place, so generated rolls never collide with existing
 * ones, explicit rolls in the same file, or each other.
 */
function makeRollGenerator(prefix: string, taken: Set<string>): () => string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seqRe = new RegExp(`^${escaped}(\\d+)$`);
  let max = 0;
  for (const roll of taken) {
    const match = seqRe.exec(roll);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let n = max;
  return () => {
    let roll: string;
    do {
      n++;
      roll = `${prefix}${String(n).padStart(4, '0')}`;
    } while (taken.has(roll));
    taken.add(roll);
    return roll;
  };
}
