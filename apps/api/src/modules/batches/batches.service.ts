import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
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

  findAll(classId?: string) {
    const instituteId = this.instituteId();
    return this.prisma.batch.findMany({
      where: { instituteId, ...(classId ? { classId } : {}) },
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
      data: { name: dto.name },
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
}
