import {
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

  findAll(programId?: string) {
    const instituteId = this.instituteId();
    return this.prisma.class.findMany({
      where: { instituteId, ...(programId ? { programId } : {}) },
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
      data: { name: dto.name },
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
}
