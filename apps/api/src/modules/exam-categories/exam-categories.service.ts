import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import {
  CreateExamCategoryDto,
  UpdateExamCategoryDto,
} from './dto/exam-category.dto';

const categorySelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

/**
 * The institute's catalogue of examination types (§2.3).
 *
 * Administrators curate it; teachers choose from it when authoring. The
 * category is what gives an approved paper its candidate-facing name, so the
 * numbering rules live here too.
 */
@Injectable()
export class ExamCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new BadRequestException('No institute context');
    }
    return { instituteId: ctx.instituteId, userId: ctx.userId };
  }

  async create(dto: CreateExamCategoryDto) {
    const { instituteId, userId } = this.ctx();
    const name = dto.name.trim();

    const clash = await this.prisma.examCategory.findFirst({
      where: { instituteId, name },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `A category named "${name}" already exists. Names must be unique so ` +
          `papers can be numbered within them.`,
      );
    }

    return this.prisma.examCategory.create({
      data: {
        instituteId,
        name,
        description: dto.description?.trim() || null,
        createdById: userId,
      },
      select: categorySelect,
    });
  }

  /**
   * The catalogue, each entry carrying how many papers have run under it — the
   * number a teacher needs to see to know what the next paper will be called.
   */
  async findAll(includeInactive = true) {
    const { instituteId } = this.ctx();
    const categories = await this.prisma.examCategory.findMany({
      where: { instituteId, ...(includeInactive ? {} : { isActive: true }) },
      select: categorySelect,
      orderBy: { name: 'asc' },
    });

    const counts = await this.prisma.exam.groupBy({
      by: ['categoryId'],
      where: { instituteId, categoryId: { not: null } },
      _count: { _all: true },
      _max: { categorySequence: true },
    });
    const byId = new Map(counts.map((c) => [c.categoryId, c]));

    return {
      items: categories.map((c) => {
        const row = byId.get(c.id);
        return {
          ...c,
          examCount: row?._count._all ?? 0,
          /** What the next approved paper in this category will be called. */
          nextName: `${c.name} - ${(row?._max.categorySequence ?? 0) + 1}`,
        };
      }),
      total: categories.length,
    };
  }

  async update(id: string, dto: UpdateExamCategoryDto) {
    const { instituteId } = this.ctx();
    await this.mustExist(id, instituteId);

    if (dto.name) {
      const clash = await this.prisma.examCategory.findFirst({
        where: { instituteId, name: dto.name.trim(), id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `A category named "${dto.name.trim()}" already exists.`,
        );
      }
    }

    return this.prisma.examCategory.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() || null }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: categorySelect,
    });
  }

  /**
   * Delete a category. Refused once papers reference it: the exams would keep
   * running but lose the name candidates saw them under. Retiring
   * (isActive:false) is the reversible option, and the error says so.
   */
  async remove(id: string) {
    const { instituteId } = this.ctx();
    await this.mustExist(id, instituteId);

    const used = await this.prisma.exam.count({ where: { categoryId: id } });
    if (used > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CategoryInUse',
        message:
          `${used} exam(s) were created under this category and would lose ` +
          `the name candidates saw them under. Retire it instead — it stays ` +
          `attached to those papers but is no longer offered for new ones.`,
        examCount: used,
      });
    }

    await this.prisma.examCategory.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Claim the next sequence number in a category.
   *
   * Called when an exam is approved. Uses the highest number already taken
   * rather than a count, so retiring or deleting a paper never causes a reused
   * number — two live papers called "Physics Practice Test - 2" would be worse
   * than a gap in the sequence.
   */
  async claimNextSequence(
    categoryId: string,
    instituteId: string,
  ): Promise<{ sequence: number; title: string }> {
    const category = await this.prisma.examCategory.findFirst({
      where: { id: categoryId, instituteId },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException('Exam category not found');

    const highest = await this.prisma.exam.aggregate({
      where: { categoryId, instituteId },
      _max: { categorySequence: true },
    });
    const sequence = (highest._max.categorySequence ?? 0) + 1;
    return { sequence, title: `${category.name} - ${sequence}` };
  }

  private async mustExist(id: string, instituteId: string) {
    const found = await this.prisma.examCategory.findFirst({
      where: { id, instituteId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Exam category not found');
  }
}
