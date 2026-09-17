import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

const classSelect = {
  id: true,
  name: true,
  programId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/** Class management (contract §2.11) — a class belongs to a program, scoped to
 * the caller's institute via the tenant context. */
@Injectable()
export class ClassesService {
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

  async create(dto: CreateClassDto) {
    const instituteId = this.instituteId();
    const program = await this.prisma.program.findFirst({
      where: { id: dto.programId, instituteId },
    });
    if (!program) throw new NotFoundException('Program not found');

    const existing = await this.prisma.class.findFirst({
      where: { programId: dto.programId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Class '${dto.name}' already exists in this program`,
      );
    }
    return this.prisma.class.create({
      data: { name: dto.name, programId: dto.programId, instituteId },
      select: classSelect,
    });
  }

  /**
   * Active entries only unless `includeArchived` is asked for.
   *
   * Archiving sets `isActive = false` and the confirm dialog tells the admin the
   * entry will stop appearing — but nothing filtered on it, so archived classes
   * kept showing up in every picker, and an admin could still assign new records
   * to something they had just retired. The flag exists so the organization
   * screen can list archived rows in order to restore them.
   */
  findAll(programId?: string, includeArchived = false) {
    const instituteId = this.instituteId();
    return this.prisma.class.findMany({
      where: {
        instituteId,
        ...(programId ? { programId } : {}),
        ...(includeArchived ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      select: classSelect,
    });
  }

  async findOne(id: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: classSelect,
    });
    if (!cls) throw new NotFoundException('Class not found');
    return cls;
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.findOne(id);
    return this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        // Restores an archived class (or archives an active one) — `remove()`
        // only ever sets this false, so without it an archived row was
        // stranded with no way back.
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: classSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.class.update({
      where: { id },
      data: { isActive: false },
      select: classSelect,
    });
  }

  /**
   * Permanent delete — the counterpart to archiving, for a row created by
   * mistake.
   *
   * Refused while any batch still hangs off the class. Every relation below
   * Class cascades (Class → Batch → Student → attempts/results), so an
   * unguarded delete would take real candidate history with it without ever
   * naming what it was about to destroy. Archiving stays the way to retire a
   * class that has been used.
   */
  async destroy(id: string) {
    await this.findOne(id);
    const batches = await this.prisma.batch.count({ where: { classId: id } });
    if (batches > 0) {
      throw new BadRequestException(
        `This class still has ${batches} batch(es). Delete or move them first, or archive the class instead.`,
      );
    }
    await this.prisma.class.delete({ where: { id } });
    return { id, deleted: true };
  }
}
