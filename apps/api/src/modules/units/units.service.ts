import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

const unitSelect = {
  id: true,
  name: true,
  subjectId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { chapters: { where: { isActive: true } } } },
} satisfies Prisma.UnitSelect;

type UnitRow = Prisma.UnitGetPayload<{ select: typeof unitSelect }>;

/** Flattens the active-chapter tally into `chapterCount`. */
function shape({ _count, ...unit }: UnitRow) {
  return { ...unit, chapterCount: _count.chapters };
}

/**
 * Unit management — the optional level between a subject and its chapters
 * (Subject → Unit → Chapter → Topic). A chapter without a unit is simply
 * "unassigned". Admin-managed, readable by TEACHER (they filter by it).
 */
@Injectable()
export class UnitsService {
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

  private duplicate(name: string) {
    return new ConflictException(
      `Unit '${name}' already exists in this subject`,
    );
  }

  async create(dto: CreateUnitDto) {
    const instituteId = this.instituteId();
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, instituteId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    const existing = await this.prisma.unit.findFirst({
      where: { subjectId: dto.subjectId, name: dto.name },
    });
    if (existing) throw this.duplicate(dto.name);

    try {
      return shape(
        await this.prisma.unit.create({
          data: { name: dto.name, subjectId: dto.subjectId, instituteId },
          select: unitSelect,
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw this.duplicate(dto.name);
      }
      throw err;
    }
  }

  async findAll(subjectId?: string) {
    const rows = await this.prisma.unit.findMany({
      where: {
        instituteId: this.instituteId(),
        ...(subjectId ? { subjectId } : {}),
      },
      orderBy: { name: 'asc' },
      select: unitSelect,
    });
    return rows.map(shape);
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: unitSelect,
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return shape(unit);
  }

  async update(id: string, dto: UpdateUnitDto) {
    const existing = await this.findOne(id);
    if (dto.name !== undefined && dto.name !== existing.name) {
      const clash = await this.prisma.unit.findFirst({
        where: {
          subjectId: existing.subjectId,
          name: dto.name,
          id: { not: id },
        },
      });
      if (clash) throw this.duplicate(dto.name);
    }
    try {
      return shape(
        await this.prisma.unit.update({
          where: { id },
          data: { name: dto.name },
          select: unitSelect,
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        dto.name
      ) {
        throw this.duplicate(dto.name);
      }
      throw err;
    }
  }

  /**
   * Soft delete, like every other taxonomy level. Refused while the unit still
   * holds active chapters: archiving it would leave those chapters pointing at
   * a hidden unit (not "unassigned", not visible under their unit), so the
   * admin is asked to move them first.
   */
  async remove(id: string) {
    const unit = await this.findOne(id);
    if (unit.chapterCount > 0) {
      throw new ConflictException(
        `Unit '${unit.name}' still has ${unit.chapterCount} active chapter${unit.chapterCount === 1 ? '' : 's'} — move or archive them first`,
      );
    }
    return shape(
      await this.prisma.unit.update({
        where: { id },
        data: { isActive: false },
        select: unitSelect,
      }),
    );
  }
}
