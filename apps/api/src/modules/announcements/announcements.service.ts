import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import {
  AnnouncementAudience,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

/** Fields safe to return to a student — no author email, no draft metadata. */
const studentSelect = {
  id: true,
  title: true,
  body: true,
  category: true,
  pinned: true,
  publishedAt: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.AnnouncementSelect;

const staffSelect = {
  ...studentSelect,
  audience: true,
  batchId: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  batch: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementSelect;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { instituteId: ctx.instituteId, userId: ctx.userId };
  }

  /* ------------------------------- staff ------------------------------- */

  async create(dto: CreateAnnouncementDto) {
    const { instituteId, userId } = this.ctx();
    const audience = dto.audience ?? AnnouncementAudience.ALL_STUDENTS;

    if (audience === AnnouncementAudience.BATCH && !dto.batchId) {
      throw new BadRequestException(
        'A batch must be chosen when the audience is BATCH',
      );
    }
    if (dto.batchId) await this.assertBatch(dto.batchId, instituteId);

    return this.prisma.announcement.create({
      data: {
        instituteId,
        createdById: userId,
        title: dto.title,
        body: dto.body,
        category: dto.category ?? 'GENERAL',
        audience,
        batchId:
          audience === AnnouncementAudience.BATCH
            ? (dto.batchId ?? null)
            : null,
        pinned: dto.pinned ?? false,
        publishedAt: dto.publish ? new Date() : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: staffSelect,
    });
  }

  /** Everything in the tenant, drafts included — this is the authoring view. */
  listForStaff() {
    const { instituteId } = this.ctx();
    return this.prisma.announcement.findMany({
      where: { instituteId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      select: staffSelect,
    });
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const { instituteId } = this.ctx();
    const existing = await this.requireOwn(id, instituteId);

    const audience = dto.audience ?? existing.audience;
    const batchId = dto.batchId === undefined ? existing.batchId : dto.batchId;
    if (audience === AnnouncementAudience.BATCH && !batchId) {
      throw new BadRequestException(
        'A batch must be chosen when the audience is BATCH',
      );
    }
    if (batchId) await this.assertBatch(batchId, instituteId);

    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.batchId !== undefined
          ? {
              batchId:
                audience === AnnouncementAudience.BATCH ? dto.batchId : null,
            }
          : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
      },
      select: staffSelect,
    });
  }

  /** Make a draft visible to students (idempotent). */
  async publish(id: string) {
    const { instituteId } = this.ctx();
    const existing = await this.requireOwn(id, instituteId);
    if (existing.publishedAt) return existing;
    return this.prisma.announcement.update({
      where: { id },
      data: { publishedAt: new Date() },
      select: staffSelect,
    });
  }

  /** Pull it back to a draft — students stop seeing it immediately. */
  async unpublish(id: string) {
    const { instituteId } = this.ctx();
    await this.requireOwn(id, instituteId);
    return this.prisma.announcement.update({
      where: { id },
      data: { publishedAt: null },
      select: staffSelect,
    });
  }

  async remove(id: string) {
    const { instituteId } = this.ctx();
    await this.requireOwn(id, instituteId);
    await this.prisma.announcement.delete({ where: { id } });
    return { id, deleted: true };
  }

  /* ------------------------------ student ------------------------------ */

  /**
   * The calling student's feed: published, unexpired, and either institute-wide
   * or aimed at their own batch. Drafts and other batches' notices are excluded
   * by the query, not by the client.
   */
  async listForStudent() {
    const { instituteId, userId } = this.ctx();
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        instituteId,
        publishedAt: { not: null, lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { audience: 'ALL_STUDENTS' },
              { audience: 'BATCH', batchId: student.batchId },
            ],
          },
        ],
      },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      select: studentSelect,
    });
  }

  /* ------------------------------ helpers ------------------------------ */

  private async requireOwn(id: string, instituteId: string) {
    const found = await this.prisma.announcement.findFirst({
      where: { id, instituteId },
      select: { id: true, audience: true, batchId: true, publishedAt: true },
    });
    if (!found) throw new NotFoundException('Announcement not found');
    return found;
  }

  private async assertBatch(batchId: string, instituteId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, instituteId },
      select: { id: true },
    });
    if (!batch) {
      throw new BadRequestException('That batch is not in your institute');
    }
  }
}
