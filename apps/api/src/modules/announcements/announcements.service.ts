import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '../auth/auth.types';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';

const DEFAULT_ANNOUNCEMENTS_PAGE_SIZE = 50;

/** Fields safe to return to a student — no author email, no draft metadata. */
const studentSelect = {
  id: true,
  title: true,
  body: true,
  category: true,
  pinned: true,
  publishedAt: true,
  attachmentKeys: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.AnnouncementSelect;

const staffSelect = {
  ...studentSelect,
  toStudents: true,
  toTeachers: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  batches: { select: { batch: { select: { id: true, name: true } } } },
  teachers: { select: { teacher: { select: { id: true, name: true } } } },
} satisfies Prisma.AnnouncementSelect;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly teacherScope: TeacherScopeService,
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
    const toStudents = dto.toStudents ?? true;
    const toTeachers = dto.toTeachers ?? false;
    const batchIds = [...new Set(dto.batchIds ?? [])];
    const teacherIds = [...new Set(dto.teacherIds ?? [])];

    this.assertAudience(toStudents, toTeachers);
    this.assertMayAddressTeachers(toTeachers, teacherIds);
    await this.assertBatches(batchIds, instituteId);
    await this.assertTeachers(teacherIds, instituteId);

    return this.prisma.announcement.create({
      data: {
        instituteId,
        createdById: userId,
        title: dto.title,
        body: dto.body,
        category: dto.category ?? 'GENERAL',
        toStudents,
        toTeachers,
        pinned: dto.pinned ?? false,
        publishedAt: dto.publish ? new Date() : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        attachmentKeys: await this.checkedAttachments(
          dto.attachmentKeys,
          instituteId,
        ),
        // Narrowing rows are only meaningful alongside their audience flag —
        // batches on a teachers-only notice would be dead rows that quietly
        // start applying if someone later ticks Students.
        batches: toStudents
          ? { create: batchIds.map((batchId) => ({ batchId, instituteId })) }
          : undefined,
        teachers: toTeachers
          ? {
              create: teacherIds.map((teacherId) => ({
                teacherId,
                instituteId,
              })),
            }
          : undefined,
      },
      select: staffSelect,
    });
  }

  /**
   * Keep only keys that are real documents in this institute.
   *
   * `attachmentKeys` is a plain String[] with no foreign key, so nothing in the
   * database stops a caller attaching another tenant's file, or a key that
   * never existed. Checking here rather than trusting the client means a notice
   * cannot be used to hand out a file its author could not otherwise reach —
   * and a typo fails at authoring time instead of becoming a broken download
   * for every student who opens it.
   */
  private async checkedAttachments(
    keys: string[] | undefined,
    instituteId: string,
  ): Promise<string[]> {
    if (!keys?.length) return [];
    const found = await this.prisma.media.findMany({
      where: { instituteId, key: { in: keys }, kind: 'DOCUMENT' },
      select: { key: true },
    });
    const usable = new Set(found.map((m) => m.key));
    const rejected = keys.filter((k) => !usable.has(k));
    if (rejected.length > 0) {
      throw new BadRequestException(
        `${rejected.length} attachment(s) could not be found in your ` +
          `institute's library. Upload them again and retry.`,
      );
    }
    // De-duplicated, keeping the caller's order: attaching the same file twice
    // is a slip, and two identical download links help nobody.
    return [...new Set(keys)];
  }

  /**
   * Everything in the tenant, drafts included — this is the authoring view
   * (§ pagination). Grows without bound over years of posting.
   */
  async listForStaff(query: QueryAnnouncementsDto = {}) {
    const { instituteId } = this.ctx();
    const where: Prisma.AnnouncementWhereInput = { instituteId };
    const limit = query.limit ?? DEFAULT_ANNOUNCEMENTS_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        select: staffSelect,
        take: limit,
        skip: offset,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const { instituteId } = this.ctx();
    const existing = await this.requireOwn(id, instituteId);

    const toStudents = dto.toStudents ?? existing.toStudents;
    const toTeachers = dto.toTeachers ?? existing.toTeachers;
    const batchIds =
      dto.batchIds === undefined ? undefined : [...new Set(dto.batchIds)];
    const teacherIds =
      dto.teacherIds === undefined ? undefined : [...new Set(dto.teacherIds)];

    this.assertAudience(toStudents, toTeachers);
    this.assertMayAddressTeachers(toTeachers, teacherIds ?? []);
    await this.assertBatches(batchIds ?? [], instituteId);
    await this.assertTeachers(teacherIds ?? [], instituteId);

    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.toStudents !== undefined ? { toStudents: dto.toStudents } : {}),
        ...(dto.toTeachers !== undefined ? { toTeachers: dto.toTeachers } : {}),
        // Same omitted-vs-empty rule as attachmentKeys below: omitting the
        // list leaves the targeting alone, sending [] widens the notice back
        // to everyone in that audience. Dropping an audience also drops its
        // rows, so re-ticking it later cannot resurrect stale targeting.
        ...(batchIds !== undefined || !toStudents
          ? {
              batches: {
                deleteMany: {},
                ...(toStudents && batchIds?.length
                  ? {
                      create: batchIds.map((batchId) => ({
                        batchId,
                        instituteId,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
        ...(teacherIds !== undefined || !toTeachers
          ? {
              teachers: {
                deleteMany: {},
                ...(toTeachers && teacherIds?.length
                  ? {
                      create: teacherIds.map((teacherId) => ({
                        teacherId,
                        instituteId,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
        // Omitted means "leave them alone"; an empty array means "remove them
        // all". Treating undefined as empty would silently strip every
        // attachment from a notice edited only to fix a typo in its title.
        ...(dto.attachmentKeys !== undefined
          ? {
              attachmentKeys: await this.checkedAttachments(
                dto.attachmentKeys,
                instituteId,
              ),
            }
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

  /* ----------------------------- recipients ---------------------------- */

  /**
   * The notices the CALLER is entitled to see, right now — student or teacher.
   *
   * Extracted so the list, the unread COUNT and mark-seen are built from one
   * filter. Two hand-written copies would drift the moment audience or expiry
   * rules changed, and a badge that disagrees with the page it points at is
   * worse than no badge. That mattered more once teachers became recipients:
   * it is one filter with a per-role clause, not a second pipeline.
   */
  private async visibleToMeWhere() {
    const { instituteId, userId } = this.ctx();
    const role = this.tenant.get()?.role;
    const now = new Date();

    // Published, in-window — true for every recipient regardless of role.
    const common = {
      instituteId,
      publishedAt: { not: null, lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    if (role === Role.TEACHER) {
      return {
        userId,
        where: {
          ...common,
          AND: [
            {
              toTeachers: true,
              // No narrowing rows means every teacher; otherwise only the
              // named ones. `none: {}` is the "addressed to all" case —
              // expressed as the absence of rows, so adding a teacher to an
              // existing notice narrows it rather than widening it.
              OR: [
                { teachers: { none: {} } },
                { teachers: { some: { teacherId: userId } } },
              ],
            },
          ],
        },
      };
    }

    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    return {
      userId,
      where: {
        ...common,
        AND: [
          {
            toStudents: true,
            OR: [
              { batches: { none: {} } },
              { batches: { some: { batchId: student.batchId } } },
            ],
          },
        ],
      },
    };
  }

  async listForMe() {
    const { where } = await this.visibleToMeWhere();
    return this.prisma.announcement.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      select: studentSelect,
    });
  }

  /**
   * How many visible notices arrived since this student last looked.
   *
   * A student who has never opened the page has `announcementsSeenAt` NULL,
   * which correctly counts everything currently published rather than nothing.
   */
  async unreadCountForMe() {
    const { userId, where } = await this.visibleToMeWhere();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { announcementsSeenAt: true },
    });
    const seenAt = user?.announcementsSeenAt ?? null;
    const count = await this.prisma.announcement.count({
      where: seenAt
        ? { ...where, publishedAt: { ...where.publishedAt, gt: seenAt } }
        : where,
    });
    return { count };
  }

  /** Mark everything currently visible as seen, clearing the badge. */
  async markSeenForMe() {
    const { userId } = await this.visibleToMeWhere();
    await this.prisma.user.update({
      where: { id: userId },
      data: { announcementsSeenAt: new Date() },
    });
    return { count: 0 };
  }

  /* ------------------------------ helpers ------------------------------ */

  private async requireOwn(id: string, instituteId: string) {
    const found = await this.prisma.announcement.findFirst({
      where: { id, instituteId },
      select: {
        id: true,
        toStudents: true,
        toTeachers: true,
        publishedAt: true,
      },
    });
    if (!found) throw new NotFoundException('Announcement not found');
    return found;
  }

  /**
   * The batch must be in the caller's institute **and**, for a TEACHER, one of
   * their own.
   *
   * The institute check alone let a teacher address a notice to any batch in
   * the school, including ones they do not teach — the only path in the app
   * that skipped the `TeacherBatch` scoping every other teacher route applies.
   * `myBatchIds()` returns null for non-teachers, who are legitimately
   * institute-wide.
   */
  private async assertBatches(batchIds: string[], instituteId: string) {
    if (batchIds.length === 0) return;
    const found = await this.prisma.batch.findMany({
      where: { id: { in: batchIds }, instituteId },
      select: { id: true },
    });
    if (found.length !== batchIds.length) {
      throw new BadRequestException(
        'One or more of those batches is not in your institute',
      );
    }

    const mine = await this.teacherScope.myBatchIds();
    if (mine !== null) {
      const outside = batchIds.filter((id) => !mine.includes(id));
      if (outside.length > 0) {
        throw new ForbiddenException(
          'You can only post announcements to batches you teach',
        );
      }
    }
  }

  /**
   * A notice addressed to nobody is not a draft — it is a notice that can
   * never be delivered, and publishing it would look like success.
   */
  private assertAudience(toStudents: boolean, toTeachers: boolean) {
    if (!toStudents && !toTeachers) {
      throw new BadRequestException(
        'Choose at least one audience: students, teachers, or both',
      );
    }
  }

  /**
   * Broadcasting to staff is an admin action (§ decided with the product
   * owner). A teacher keeps the ability they already had — notifying their own
   * students — but cannot address other teachers.
   *
   * Refused loudly rather than quietly dropped: an author who ticks Teachers
   * and gets a silent students-only notice has been told the wrong thing about
   * who read it.
   */
  private assertMayAddressTeachers(toTeachers: boolean, teacherIds: string[]) {
    if (!toTeachers && teacherIds.length === 0) return;
    if (this.tenant.get()?.role === Role.TEACHER) {
      throw new ForbiddenException(
        'Only an administrator can send announcements to teachers',
      );
    }
  }

  /** Named recipients must be teachers in this institute, not any user id. */
  private async assertTeachers(teacherIds: string[], instituteId: string) {
    if (teacherIds.length === 0) return;
    const found = await this.prisma.user.findMany({
      where: {
        id: { in: teacherIds },
        instituteId,
        roles: { has: Role.TEACHER },
      },
      select: { id: true },
    });
    if (found.length !== teacherIds.length) {
      throw new BadRequestException(
        'One or more of those teachers is not in your institute',
      );
    }
  }
}
