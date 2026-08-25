import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { Role, UserStatus } from '../auth/auth.types';
import { InvitationService } from '../auth/invitation/invitation.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

/**
 * Teaching-staff roster (§2.4 admin console).
 *
 * A teacher/admin is a `User` with role TEACHER/ADMIN — there is no separate
 * Teacher/Admin model. Subjects are derived from authored questions (no
 * teacher→subject relation exists). Batch assignment DOES have a real
 * relation (TeacherBatch) — it scopes what a TEACHER session may see
 * elsewhere (exams/students/results/analytics/monitoring); it means nothing
 * for an ADMIN, who is never batch-restricted.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly invitations: InvitationService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.get()?.instituteId;
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  async findAll(query: QueryStaffDto) {
    const instituteId = this.instituteId();
    const term = query.search?.trim();

    const where = {
      instituteId,
      roles: { has: query.role ?? ('TEACHER' as const) },
      ...(query.status ? { status: query.status } : {}),
      ...(query.batchId
        ? { teacherBatches: { some: { batchId: query.batchId } } }
        : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          roles: true,
          status: true,
          createdAt: true,
          _count: {
            select: { questionsCreated: true, examsCreated: true },
          },
          sessions: {
            where: { revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
      this.prisma.user.count({ where }),
    ]);

    const ids = users.map((u) => u.id);
    const [subjectsByUser, batchesByUser] = await Promise.all([
      this.subjectsByUser(instituteId, ids),
      this.batchesByUser(ids),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: u.roles,
        status: u.status,
        joinedAt: u.createdAt,
        subjects: (subjectsByUser.get(u.id) ?? []).sort(),
        batches: batchesByUser.get(u.id) ?? [],
        questionsAuthored: u._count.questionsCreated,
        examsAuthored: u._count.examsCreated,
        lastLoginAt: u.sessions[0]?.createdAt ?? null,
      })),
      total,
      limit: take,
      offset: skip,
    };
  }

  async findOne(id: string) {
    const instituteId = this.instituteId();
    const u = await this.prisma.user.findFirst({
      where: {
        id,
        instituteId,
        roles: { hasSome: [Role.TEACHER, Role.ADMIN] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        status: true,
        createdAt: true,
        _count: { select: { questionsCreated: true, examsCreated: true } },
        sessions: {
          where: { revokedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    if (!u) throw new NotFoundException('Staff member not found');

    const [subjectsByUser, batchesByUser] = await Promise.all([
      this.subjectsByUser(instituteId, [u.id]),
      this.batchesByUser([u.id]),
    ]);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      roles: u.roles,
      status: u.status,
      joinedAt: u.createdAt,
      subjects: (subjectsByUser.get(u.id) ?? []).sort(),
      batches: batchesByUser.get(u.id) ?? [],
      questionsAuthored: u._count.questionsCreated,
      examsAuthored: u._count.examsCreated,
      lastLoginAt: u.sessions[0]?.createdAt ?? null,
    };
  }

  async update(id: string, dto: UpdateStaffDto) {
    const ctx = this.tenant.get();
    const owned = await this.getOwned(id);

    if (dto.roles !== undefined) {
      await this.assertRoleChangeAllowed(owned, dto.roles, ctx?.userId);
    }

    if (
      dto.name !== undefined ||
      dto.roles !== undefined ||
      dto.phone !== undefined
    ) {
      await this.prisma.user.update({
        where: { id: owned.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.roles !== undefined ? { roles: dto.roles } : {}),
          // null means "clear it"; an empty string is a client-side mistake
          // (the DTO allows it through Matches) so we coerce. We trim too —
          // reformatting-without-trimming is how the displayed value drifts
          // from the stored value, and `+91 987...` reads better than
          // `  +91  987...  ` everywhere it appears.
          ...(dto.phone !== undefined
            ? {
                phone:
                  dto.phone == null || dto.phone.trim() === ''
                    ? null
                    : dto.phone.trim(),
              }
            : {}),
        },
      });
    }

    /**
     * Dropping TEACHER removes the batch assignments that came with it.
     *
     * `TeacherBatch` rows are what scope a teacher to their own classes. Left
     * behind on an account that is no longer a teacher they are dead weight,
     * and they would silently come back into force if the role were ever
     * restored — granting access nobody consciously re-approved.
     */
    if (dto.roles && !dto.roles.includes(Role.TEACHER)) {
      await this.prisma.teacherBatch.deleteMany({ where: { teacherId: id } });
    }

    return this.findOne(id);
  }

  /**
   * Guards on changing someone's roles.
   *
   * Three things must hold, and none of them is enforceable by the DTO alone:
   *
   *  1. **No self-demotion.** An admin removing their own ADMIN role locks
   *     themselves out of the console mid-session, with no way back except
   *     another admin — or nobody at all, if they were the last one.
   *  2. **Never the last administrator.** The same rule `deactivate()` already
   *     applies; demotion is the other way to reach an institute with no
   *     administrator, and it was previously unguarded because the role could
   *     not be changed at all.
   *  3. **Only assignable roles.** The DTO restricts the enum, but this repeats
   *     the check so a future caller reaching the service directly cannot grant
   *     SUPERADMIN.
   */
  private async assertRoleChangeAllowed(
    owned: { id: string; roles: Role[] },
    next: Role[],
    actorId: string | undefined,
  ): Promise<void> {
    const allowed = new Set<Role>([Role.TEACHER, Role.ADMIN]);
    const invalid = next.filter((r) => !allowed.has(r));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Roles that cannot be assigned here: ${invalid.join(', ')}`,
      );
    }

    const wasAdmin = owned.roles.includes(Role.ADMIN);
    const willBeAdmin = next.includes(Role.ADMIN);
    if (!wasAdmin || willBeAdmin) return; // not a demotion from ADMIN

    if (owned.id === actorId) {
      throw new BadRequestException(
        'You cannot remove your own administrator role',
      );
    }

    const remainingAdmins = await this.prisma.user.count({
      where: {
        instituteId: this.instituteId(),
        roles: { has: Role.ADMIN },
        status: UserStatus.ACTIVE,
        id: { not: owned.id },
      },
    });
    if (remainingAdmins === 0) {
      throw new BadRequestException(
        'Cannot remove the last administrator of this institute',
      );
    }
  }

  /** Soft-delete: disables the staff member's account. */
  async deactivate(id: string) {
    const ctx = this.tenant.get();
    const owned = await this.getOwned(id);

    if (owned.id === ctx?.userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (owned.roles.includes(Role.ADMIN)) {
      const remainingAdmins = await this.prisma.user.count({
        where: {
          instituteId: this.instituteId(),
          roles: { has: Role.ADMIN },
          status: UserStatus.ACTIVE,
          id: { not: owned.id },
        },
      });
      if (remainingAdmins === 0) {
        throw new BadRequestException(
          'Cannot deactivate the last administrator of this institute',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: owned.id },
      data: { status: UserStatus.DISABLED },
    });
    return this.findOne(id);
  }

  /** Undoes a deactivation. Refuses a PENDING/ACTIVE account — there is no
   * disabled state to lift, so "reactivate" would be a confusing no-op. */
  async reactivate(id: string) {
    const owned = await this.getOwned(id);
    if (owned.status !== UserStatus.DISABLED) {
      throw new BadRequestException(
        'Only a deactivated staff member can be reactivated',
      );
    }
    await this.prisma.user.update({
      where: { id: owned.id },
      data: { status: UserStatus.ACTIVE },
    });
    return this.findOne(id);
  }

  /** Re-sends the activation email for a staff member still awaiting one. */
  async resendInvite(id: string) {
    const owned = await this.getOwned(id);
    await this.invitations.resendInvite(owned.id, this.instituteId());
    return this.findOne(id);
  }

  /** Full-replace: the given set becomes the teacher's complete assignment. */
  async setBatches(id: string, batchIds: string[]) {
    const instituteId = this.instituteId();
    const owned = await this.getOwned(id);
    if (!owned.roles.includes(Role.TEACHER)) {
      throw new BadRequestException(
        'Batch assignment only applies to teachers',
      );
    }

    const unique = [...new Set(batchIds)];
    if (unique.length) {
      const found = await this.prisma.batch.count({
        where: { id: { in: unique }, instituteId },
      });
      if (found !== unique.length) {
        throw new BadRequestException(
          'One or more batches were not found in your institute',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teacherBatch.deleteMany({
        where: { teacherId: id, batchId: { notIn: unique } },
      });
      for (const batchId of unique) {
        await tx.teacherBatch.upsert({
          where: { teacherId_batchId: { teacherId: id, batchId } },
          create: { teacherId: id, batchId, instituteId },
          update: {},
        });
      }
    });

    return this.getBatches(id);
  }

  async getBatches(id: string) {
    await this.getOwned(id);
    return this.batchList(id);
  }

  /** Self-service: the calling teacher's own assignment. */
  async myBatches() {
    const ctx = this.tenant.get();
    if (!ctx?.userId) {
      throw new ForbiddenException('No user in the current context');
    }
    return this.batchList(ctx.userId);
  }

  private async batchList(teacherId: string) {
    const rows = await this.prisma.teacherBatch.findMany({
      where: { teacherId },
      select: { batch: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.batch);
  }

  private async subjectsByUser(
    instituteId: string,
    ids: string[],
  ): Promise<Map<string, string[]>> {
    const authored = ids.length
      ? await this.prisma.question.findMany({
          where: { instituteId, createdById: { in: ids } },
          select: { createdById: true, subject: true },
          distinct: ['createdById', 'subject'],
        })
      : [];
    const map = new Map<string, string[]>();
    for (const row of authored) {
      const list = map.get(row.createdById) ?? [];
      list.push(row.subject);
      map.set(row.createdById, list);
    }
    return map;
  }

  private async batchesByUser(
    ids: string[],
  ): Promise<Map<string, { id: string; name: string }[]>> {
    const rows = ids.length
      ? await this.prisma.teacherBatch.findMany({
          where: { teacherId: { in: ids } },
          select: {
            teacherId: true,
            batch: { select: { id: true, name: true } },
          },
        })
      : [];
    const map = new Map<string, { id: string; name: string }[]>();
    for (const row of rows) {
      const list = map.get(row.teacherId) ?? [];
      list.push(row.batch);
      map.set(row.teacherId, list);
    }
    return map;
  }

  private async getOwned(id: string) {
    const instituteId = this.instituteId();
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        instituteId,
        roles: { hasSome: [Role.TEACHER, Role.ADMIN] },
      },
      select: { id: true, roles: true, status: true },
    });
    if (!user) throw new NotFoundException('Staff member not found');
    return user;
  }
}
