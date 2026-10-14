import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantSetConfigStatement } from '../../database/tenant-rls.extension';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

const subjectSelect = {
  id: true,
  name: true,
  classId: true,
  class: {
    select: {
      id: true,
      name: true,
      isActive: true,
      programId: true,
      program: { select: { name: true } },
    },
  },
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubjectSelect;

type SubjectRow = Prisma.SubjectGetPayload<{ select: typeof subjectSelect }>;

/** Flattens the nested program into `class.programName`; null = no class. */
function shape({ class: cls, ...subject }: SubjectRow) {
  return {
    ...subject,
    classId: subject.classId ?? null,
    class: cls
      ? {
          id: cls.id,
          name: cls.name,
          isActive: cls.isActive,
          programId: cls.programId,
          programName: cls.program?.name ?? '',
        }
      : null,
  };
}

export interface SubjectFilters {
  classId?: string;
  noClass?: boolean;
}

/**
 * Question-bank subject management (§2.4), scoped to the caller's institute.
 * Sits under an (optional) academic Class in the Class → Subject → Unit →
 * Chapter → Topic classification hierarchy. Readable by TEACHER too (they pick
 * from this list when authoring a question).
 *
 * Names are unique per (institute, class). Postgres treats NULLs as distinct,
 * so uniqueness among subjects with no class is enforced here, not by the index.
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

  private duplicate(name: string, classId: string | null) {
    return new ConflictException(
      classId
        ? `Subject '${name}' already exists in this class`
        : `Subject '${name}' already exists with no class`,
    );
  }

  private async assertClassUsable(classId: string, instituteId: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, instituteId },
      select: { id: true, isActive: true },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (!cls.isActive) {
      throw new BadRequestException(
        'This class is archived. Restore it or choose another class.',
      );
    }
  }

  async create(dto: CreateSubjectDto) {
    const instituteId = this.instituteId();
    const classId = dto.classId ?? null;
    if (classId) await this.assertClassUsable(classId, instituteId);

    const existing = await this.prisma.subject.findFirst({
      where: { instituteId, classId, name: dto.name },
    });
    if (existing) throw this.duplicate(dto.name, classId);
    try {
      return shape(
        await this.prisma.subject.create({
          data: { name: dto.name, instituteId, classId },
          select: subjectSelect,
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw this.duplicate(dto.name, classId);
      }
      throw err;
    }
  }

  async findAll(filters: SubjectFilters = {}) {
    if (filters.classId && filters.noClass) {
      throw new BadRequestException(
        'Pass either classId or noClass=true, not both',
      );
    }
    const rows = await this.prisma.subject.findMany({
      where: {
        instituteId: this.instituteId(),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.noClass ? { classId: null } : {}),
      },
      orderBy: { name: 'asc' },
      select: subjectSelect,
    });
    return rows.map(shape);
  }

  /** Subjects plus how many ACTIVE units / chapters / topics each one holds. */
  async findAllWithCounts(filters: SubjectFilters = {}) {
    const instituteId = this.instituteId();
    const subjects = await this.findAll(filters);
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
    return shape(subject);
  }

  async update(id: string, dto: UpdateSubjectDto) {
    const instituteId = this.instituteId();
    const existing = await this.findOne(id); // enforces tenant ownership
    const currentClassId = existing.classId ?? null;
    // undefined = leave the class alone, null = detach it.
    const targetClassId =
      dto.classId === undefined ? currentClassId : dto.classId;
    const classChanged = targetClassId !== currentClassId;
    const nameChanged = dto.name !== undefined && dto.name !== existing.name;
    const targetName = dto.name ?? existing.name;

    if (!nameChanged && !classChanged) {
      return shape(
        await this.prisma.subject.update({
          where: { id },
          data: { name: dto.name, classId: dto.classId },
          select: subjectSelect,
        }),
      );
    }

    if (classChanged && targetClassId) {
      await this.assertClassUsable(targetClassId, instituteId);
    }
    const clash = await this.prisma.subject.findFirst({
      where: {
        instituteId,
        classId: targetClassId,
        name: targetName,
        id: { not: id },
      },
    });
    if (clash) throw this.duplicate(targetName, targetClassId);

    try {
      if (!nameChanged) {
        // A move leaves the name, and so every question's subject text, as is.
        return shape(
          await this.prisma.subject.update({
            where: { id },
            data: { classId: targetClassId },
            select: subjectSelect,
          }),
        );
      }
      // Questions carry the subject name as denormalised text (search, export,
      // review screens read it), so the rename and the resync are one unit.
      return await this.prisma.raw.$transaction(async (tx) => {
        await tenantSetConfigStatement(tx, this.tenant);
        const updated = await tx.subject.update({
          where: { id },
          data: {
            name: dto.name,
            ...(classChanged ? { classId: targetClassId } : {}),
          },
          select: subjectSelect,
        });
        await tx.question.updateMany({
          where: { subjectId: id },
          data: { subject: dto.name },
        });
        return shape(updated);
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw this.duplicate(targetName, targetClassId);
      }
      throw err;
    }
  }

  async remove(id: string) {
    await this.findOne(id); // enforces tenant ownership
    return shape(
      await this.prisma.subject.update({
        where: { id },
        data: { isActive: false },
        select: subjectSelect,
      }),
    );
  }
}
