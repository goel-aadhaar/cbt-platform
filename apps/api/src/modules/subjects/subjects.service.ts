import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { tenantSetConfigStatement } from '../../database/tenant-rls.extension';
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

  /** Subjects plus how many ACTIVE units / chapters / topics each one holds. */
  async findAllWithCounts() {
    const instituteId = this.instituteId();
    const subjects = await this.findAll();
    const [units, chapters, chapterTopics] = await Promise.all([
      this.prisma.unit.groupBy({
        by: ['subjectId'],
        where: { instituteId, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.chapter.groupBy({
        by: ['subjectId'],
        where: { instituteId, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.chapter.findMany({
        where: { instituteId, isActive: true },
        select: {
          subjectId: true,
          _count: { select: { topics: { where: { isActive: true } } } },
        },
      }),
    ]);

    const unitCount = new Map(units.map((r) => [r.subjectId, r._count._all]));
    const chapterCount = new Map(
      chapters.map((r) => [r.subjectId, r._count._all]),
    );
    const topicCount = new Map<string, number>();
    for (const c of chapterTopics) {
      topicCount.set(
        c.subjectId,
        (topicCount.get(c.subjectId) ?? 0) + c._count.topics,
      );
    }

    return subjects.map((s) => ({
      ...s,
      counts: {
        units: unitCount.get(s.id) ?? 0,
        chapters: chapterCount.get(s.id) ?? 0,
        topics: topicCount.get(s.id) ?? 0,
      },
    }));
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
    const existing = await this.findOne(id); // enforces tenant ownership
    if (dto.name === undefined || dto.name === existing.name) {
      return this.prisma.subject.update({
        where: { id },
        data: { name: dto.name },
        select: subjectSelect,
      });
    }

    const clash = await this.prisma.subject.findFirst({
      where: {
        instituteId: this.instituteId(),
        name: dto.name,
        id: { not: id },
      },
    });
    if (clash) {
      throw new ConflictException(`Subject '${dto.name}' already exists`);
    }
    // Questions carry the subject name as denormalised text (search, export,
    // review screens read it), so the rename and the resync are one unit.
    return this.prisma.raw.$transaction(async (tx) => {
      await tenantSetConfigStatement(tx, this.tenant);
      const updated = await tx.subject.update({
        where: { id },
        data: { name: dto.name },
        select: subjectSelect,
      });
      await tx.question.updateMany({
        where: { subjectId: id },
        data: { subject: dto.name },
      });
      return updated;
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
