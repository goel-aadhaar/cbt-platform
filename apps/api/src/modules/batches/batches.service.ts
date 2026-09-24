import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { tenantSetConfigStatement } from '../../database/tenant-rls.extension';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

const batchSelect = {
  id: true,
  name: true,
  classId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/** Batch management (contract §2.11) — a batch belongs to a class, scoped to the
 * caller's institute via the tenant context. */
@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  async create(dto: CreateBatchDto) {
    const instituteId = this.instituteId();
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, instituteId },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const existing = await this.prisma.batch.findFirst({
      where: { classId: dto.classId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Batch '${dto.name}' already exists in this class`,
      );
    }
    return this.prisma.batch.create({
      data: { name: dto.name, classId: dto.classId, instituteId },
      select: batchSelect,
    });
  }

  /**
   * Active entries only unless `includeArchived` is asked for.
   *
   * Archiving sets `isActive = false` and the confirm dialog tells the admin the
   * entry will stop appearing — but nothing filtered on it, so archived batches
   * kept showing up in every picker, and an admin could still assign new records
   * to something they had just retired. The flag exists so the organization
   * screen can list archived rows in order to restore them.
   */
  findAll(classId?: string, includeArchived = false) {
    const instituteId = this.instituteId();
    return this.prisma.batch.findMany({
      where: {
        instituteId,
        ...(classId ? { classId } : {}),
        ...(includeArchived ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      select: batchSelect,
    });
  }

  async findOne(id: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: batchSelect,
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async update(id: string, dto: UpdateBatchDto) {
    await this.findOne(id);
    return this.prisma.batch.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        // Restores an archived batch (or archives an active one) — `remove()`
        // only ever sets this false, so without it an archived row was
        // stranded with no way back.
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: batchSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.batch.update({
      where: { id },
      data: { isActive: false },
      select: batchSelect,
    });
  }

  /**
   * Permanent delete — the counterpart to archiving, for a row created by
   * mistake.
   *
   * Refused while anything still points at the batch. Student rows cascade
   * (and take their attempts and results with them), and the assignment joins
   * for exams, DPPs, resources, announcements and teachers cascade too, so an
   * unguarded delete quietly destroys candidate history and silently
   * un-assigns live papers. Archiving stays the way to retire a batch in use.
   */
  async destroy(id: string) {
    await this.findOne(id);
    const [, students, exams, dpps, resources, announcements, teachers] =
      await this.prisma.raw.$transaction([
        tenantSetConfigStatement(this.prisma.raw, this.tenant),
        this.prisma.raw.student.count({ where: { batchId: id } }),
        this.prisma.raw.examBatch.count({ where: { batchId: id } }),
        this.prisma.raw.dppBatch.count({ where: { batchId: id } }),
        this.prisma.raw.resourceBatch.count({ where: { batchId: id } }),
        this.prisma.raw.announcementBatch.count({ where: { batchId: id } }),
        this.prisma.raw.teacherBatch.count({ where: { batchId: id } }),
      ]);
    const blockers = [
      students && `${students} student(s)`,
      exams && `${exams} exam assignment(s)`,
      dpps && `${dpps} DPP assignment(s)`,
      resources && `${resources} shared resource(s)`,
      announcements && `${announcements} announcement(s)`,
      teachers && `${teachers} teacher assignment(s)`,
    ].filter((b): b is string => typeof b === 'string');
    if (blockers.length > 0) {
      throw new BadRequestException(
        `This batch is still in use by ${blockers.join(', ')}. Archive it instead, or remove those first.`,
      );
    }
    await this.prisma.batch.delete({ where: { id } });
    return { id, deleted: true };
  }
}
