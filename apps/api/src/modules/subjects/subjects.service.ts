import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

const subjectSelect = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Question-bank subject management (§2.4), scoped to the caller's institute.
 * Top level of the Subject → Chapter → Topic classification hierarchy —
 * mirrors ProgramsService exactly, but readable by TEACHER too (they pick
 * from this list when authoring a question).
 */
@Injectable()
export class SubjectsService {
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

  async create(dto: CreateSubjectDto) {
    const instituteId = this.instituteId();
    const existing = await this.prisma.subject.findFirst({
      where: { instituteId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Subject '${dto.name}' already exists`);
    }
    return this.prisma.subject.create({
      data: { name: dto.name, instituteId },
      select: subjectSelect,
    });
  }

  findAll() {
    return this.prisma.subject.findMany({
      where: { instituteId: this.instituteId() },
      orderBy: { name: 'asc' },
      select: subjectSelect,
    });
  }

  async findOne(id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: subjectSelect,
    });
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  async update(id: string, dto: UpdateSubjectDto) {
    await this.findOne(id); // enforces tenant ownership
    return this.prisma.subject.update({
      where: { id },
      data: { name: dto.name },
      select: subjectSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // enforces tenant ownership
    return this.prisma.subject.update({
      where: { id },
      data: { isActive: false },
      select: subjectSelect,
    });
  }
}
