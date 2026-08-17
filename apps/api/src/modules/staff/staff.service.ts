import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryStaffDto } from './dto/query-staff.dto';

/**
 * Teaching-staff roster (§2.4 admin console).
 *
 * There is no Teacher model — a teacher is a `User` with role TEACHER — and no
 * teacher→subject or teacher→batch relation exists in the schema. Rather than
 * invent those columns, the roster derives what the data can actually support:
 * the subjects a teacher authors questions in, how much they've authored, and
 * when they last signed in (latest non-revoked session).
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
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

    // Subjects are derived from authored questions — one grouped query for the
    // whole page rather than a per-teacher round-trip.
    const ids = users.map((u) => u.id);
    const authored = ids.length
      ? await this.prisma.question.findMany({
          where: { instituteId, createdById: { in: ids } },
          select: { createdById: true, subject: true },
          distinct: ['createdById', 'subject'],
        })
      : [];
    const subjectsByUser = new Map<string, string[]>();
    for (const row of authored) {
      const list = subjectsByUser.get(row.createdById) ?? [];
      list.push(row.subject);
      subjectsByUser.set(row.createdById, list);
    }

    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: u.roles,
        status: u.status,
        joinedAt: u.createdAt,
        subjects: (subjectsByUser.get(u.id) ?? []).sort(),
        questionsAuthored: u._count.questionsCreated,
        examsAuthored: u._count.examsCreated,
        lastLoginAt: u.sessions[0]?.createdAt ?? null,
      })),
      total,
      limit: take,
      offset: skip,
    };
  }
}
