import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';

const programSelect = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Program management (contract §2.11), scoped to the caller's institute via the
 * tenant context (isolation layer 1). Every query filters by institute_id, so
 * one institute's admin can never see or touch another's programs.
 */
@Injectable()
export class ProgramsService {
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

  async create(dto: CreateProgramDto) {
    const instituteId = this.instituteId();
    const existing = await this.prisma.program.findFirst({
      where: { instituteId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Program '${dto.name}' already exists`);
    }
    return this.prisma.program.create({
      data: { name: dto.name, instituteId },
      select: programSelect,
    });
  }

  /**
   * Active entries only unless `includeArchived` is asked for.
   *
   * Archiving sets `isActive = false` and the confirm dialog tells the admin the
   * entry will stop appearing — but nothing filtered on it, so archived programs
   * kept showing up in every picker, and an admin could still assign new records
   * to something they had just retired. The flag exists so the organization
   * screen can list archived rows in order to restore them.
   */
  findAll(includeArchived = false) {
    return this.prisma.program.findMany({
      where: {
        instituteId: this.instituteId(),
        ...(includeArchived ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      select: programSelect,
    });
  }

  async findOne(id: string) {
    const program = await this.prisma.program.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: programSelect,
    });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  async update(id: string, dto: UpdateProgramDto) {
    await this.findOne(id); // enforces tenant ownership
    return this.prisma.program.update({
      where: { id },
      data: { name: dto.name },
      select: programSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // enforces tenant ownership
    return this.prisma.program.update({
      where: { id },
      data: { isActive: false },
      select: programSelect,
    });
  }
}
