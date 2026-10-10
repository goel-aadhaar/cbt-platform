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
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';

const chapterSelect = {
  id: true,
  name: true,
  subjectId: true,
  unitId: true,
  unit: { select: { id: true, name: true } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/** Chapter management (§2.4) — a chapter belongs to a subject, scoped to the
 * caller's institute. Mirrors ClassesService; readable by TEACHER too. */
@Injectable()
export class ChaptersService {
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

  async create(dto: CreateChapterDto) {
    const instituteId = this.instituteId();
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, instituteId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    if (dto.unitId) {
      await this.assertUnitInSubject(dto.unitId, dto.subjectId, instituteId);
    }

    const existing = await this.prisma.chapter.findFirst({
      where: { subjectId: dto.subjectId, name: dto.name },
    });
    if (existing) throw this.duplicate(dto.name);
    return this.prisma.chapter.create({
      data: {
        name: dto.name,
        subjectId: dto.subjectId,
        unitId: dto.unitId ?? null,
        instituteId,
      },
      select: chapterSelect,
    });
  }

  private duplicate(name: string) {
    return new ConflictException(
      `Chapter '${name}' already exists in this subject`,
    );
  }

  /** A chapter's unit must exist in the institute, be live, and sit in the
   * chapter's own subject — the unit can never change the chapter's subject. */
  private async assertUnitInSubject(
    unitId: string,
    subjectId: string,
    instituteId: string,
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, instituteId },
    });
    if (!unit) throw new BadRequestException('Unit not found');
    if (unit.subjectId !== subjectId) {
      throw new BadRequestException(
        'That unit belongs to a different subject than this chapter',
      );
    }
    if (!unit.isActive) {
      throw new BadRequestException('That unit is archived');
    }
  }

  findAll(subjectId?: string, unitId?: string, unassigned?: boolean) {
    const instituteId = this.instituteId();
    if (unitId && unassigned) {
      throw new BadRequestException(
        'Pass either unitId or unassigned=true, not both',
      );
    }
    return this.prisma.chapter.findMany({
      where: {
        instituteId,
        ...(subjectId ? { subjectId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(unassigned ? { unitId: null } : {}),
      },
      orderBy: { name: 'asc' },
      select: chapterSelect,
    });
  }

  async findOne(id: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: chapterSelect,
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    return chapter;
  }

  async update(id: string, dto: UpdateChapterDto) {
    const existing = await this.findOne(id);
    const renamed = dto.name !== undefined && dto.name !== existing.name;

    if (renamed) {
      const clash = await this.prisma.chapter.findFirst({
        where: {
          subjectId: existing.subjectId,
          name: dto.name,
          id: { not: id },
        },
      });
      if (clash) throw this.duplicate(dto.name!);
    }
    // undefined = leave alone, null = detach, string = move.
    if (dto.unitId && dto.unitId !== existing.unitId) {
      await this.assertUnitInSubject(
        dto.unitId,
        existing.subjectId,
        this.instituteId(),
      );
    }
    const data = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
    };

    if (!renamed) {
      return this.prisma.chapter.update({
        where: { id },
        data,
        select: chapterSelect,
      });
    }
    // Questions carry the chapter name as denormalised text (search, export,
    // review screens read it), so the rename and the resync are one unit.
    return this.prisma.raw.$transaction(async (tx) => {
      await tenantSetConfigStatement(tx, this.tenant);
      const updated = await tx.chapter.update({
        where: { id },
        data,
        select: chapterSelect,
      });
      await tx.question.updateMany({
        where: { chapterId: id },
        data: { chapter: dto.name },
      });
      return updated;
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.chapter.update({
      where: { id },
      data: { isActive: false },
      select: chapterSelect,
    });
  }
}
