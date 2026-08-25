import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PRE_START_ATTEMPT_STATUSES } from '../attempts/attempt.types';
import { MediaStoragePort } from '../media/ports/media-storage.port';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { UpdateMyInstituteDto } from './dto/update-my-institute.dto';

/** Shape returned for every tenant row in the superadmin console. */
const summarySelect = {
  id: true,
  name: true,
  slug: true,
  code: true,
  isActive: true,
  createdAt: true,
  logoKey: true,
} as const;

const MAX_CODE_ATTEMPTS = 20;

/**
 * Tenant administration — superadmin only.
 *
 * Institute is the tenant root (§2.1), so unlike every other service this one
 * deliberately reads across tenants. It is reachable only through
 * @Roles(SUPERADMIN) routes, and a superadmin carries no instituteId of its own.
 */
@Injectable()
export class InstitutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStoragePort,
  ) {}

  /**
   * Institute branding (§ institute branding). `logoKey` on the row becomes
   * a fetchable `logoUrl` here — the same key → URL resolution every other
   * media reference in the API uses — so no caller ever has to know or
   * construct storage keys themselves.
   */
  private resolveLogoUrl(key: string | null): string | null {
    if (!key) return null;
    return (
      this.storage.publicUrl(key) ?? `/media/file/${encodeURIComponent(key)}`
    );
  }

  private withLogo<T extends { logoKey: string | null }>(
    row: T,
  ): Omit<T, 'logoKey'> & { logoUrl: string | null } {
    const { logoKey, ...rest } = row;
    return { ...rest, logoUrl: this.resolveLogoUrl(logoKey) };
  }

  async create(dto: CreateInstituteDto) {
    const existing = await this.prisma.institute.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Institute slug '${dto.slug}' is already taken`,
      );
    }

    // 4-digit code, assigned once and never changed (every student roll
    // number this institute issues embeds it). Random + retry-on-conflict
    // rather than a counter: 10,000 possible codes and nowhere near that
    // many institutes, so a collision is rare enough that retrying is
    // simpler than machinery to avoid one.
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const code = String(randomInt(0, 10000)).padStart(4, '0');
      try {
        const institute = await this.prisma.institute.create({
          data: { name: dto.name, slug: dto.slug, code },
          select: summarySelect,
        });
        // Every other method on this service attaches `stats` — a freshly
        // created tenant has nothing yet, but the frontend's Tenant type
        // treats `stats` as required and reads `t.stats.students` straight
        // off the row the create call returns. Omitting it here crashed the
        // tenants list the moment a new institute was added.
        return { ...this.withLogo(institute), stats: emptyStats() };
      } catch (err) {
        // Only retry a genuine code collision — a slug race (the caller's
        // own check above is TOCTOU-able too) needs a new slug from the
        // caller, not another code, so burning retries on it would just
        // fail the same way 20 times before surfacing a confusing error.
        const codeCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes('code');
        if (!codeCollision || attempt === MAX_CODE_ATTEMPTS) throw err;
      }
    }
    // Unreachable — the loop above always returns or throws.
    throw new Error('Could not allocate an institute code');
  }

  /**
   * Every tenant with the counts that say whether it is actually being used.
   *
   * The counts come from a single grouped pass per entity rather than a query
   * per institute, so the list does not degrade as tenants are added.
   */
  async findAll(
    params: {
      search?: string;
      includeInactive?: boolean;
      /** Narrower than includeInactive, which is only a toggle. */
      status?: 'active' | 'suspended';
      sort?: 'created' | 'name' | 'students' | 'exams' | 'attempts';
      order?: 'asc' | 'desc';
    } = {},
  ) {
    const where = {
      ...(params.includeInactive === false ? { isActive: true } : {}),
      // An explicit status wins over the includeInactive toggle: asking for
      // suspended tenants must not be silently widened back to "all".
      ...(params.status ? { isActive: params.status === 'active' } : {}),
      ...(params.search
        ? {
            OR: [
              {
                name: { contains: params.search, mode: 'insensitive' as const },
              },
              {
                slug: { contains: params.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const institutes = await this.prisma.institute.findMany({
      where,
      select: summarySelect,
      orderBy: { createdAt: 'desc' },
    });

    const stats = await this.statsByInstitute();
    const items = institutes.map((i) => ({
      ...this.withLogo(i),
      stats: stats.get(i.id) ?? emptyStats(),
    }));

    /**
     * Sorted here rather than in the query because four of the five sort keys
     * are counts from other tables, aggregated after the fact — Prisma cannot
     * order by them in one statement. The list is one row per tenant, so this
     * is a handful of rows however large the platform gets.
     */
    const key = params.sort ?? 'created';
    const dir = params.order === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      switch (key) {
        case 'name':
          // Locale compare so "Ä" sorts next to "A" rather than after "Z".
          return a.name.localeCompare(b.name) * dir;
        case 'students':
          return (a.stats.students - b.stats.students) * dir;
        case 'exams':
          return (a.stats.exams - b.stats.exams) * dir;
        case 'attempts':
          return (a.stats.attempts - b.stats.attempts) * dir;
        default:
          return (
            (new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime()) *
            dir
          );
      }
    });

    return { items, total: items.length };
  }

  async findOne(id: string) {
    const institute = await this.prisma.institute.findUnique({
      where: { id },
      select: summarySelect,
    });
    if (!institute) throw new NotFoundException('Institute not found');

    const [stats, staff, lastAttempt] = await Promise.all([
      this.statsByInstitute(id),
      this.prisma.user.findMany({
        where: { instituteId: id, roles: { hasSome: ['ADMIN', 'TEACHER'] } },
        select: {
          id: true,
          name: true,
          email: true,
          roles: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.attempt.findFirst({
        // Excludes PENDING_APPROVAL/APPROVED/DENIED: their startedAt is
        // null, which sorts FIRST on a DESC order — unfiltered, a pending
        // entry request would read back as "no last activity".
        where: {
          instituteId: id,
          status: { notIn: PRE_START_ATTEMPT_STATUSES },
        },
        select: { startedAt: true },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    return {
      ...this.withLogo(institute),
      stats: stats.get(id) ?? emptyStats(),
      staff,
      lastActivityAt: lastAttempt?.startedAt ?? null,
    };
  }

  async update(id: string, dto: UpdateInstituteDto) {
    await this.mustExist(id);
    const institute = await this.prisma.institute.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: summarySelect,
    });
    return this.withLogo(institute);
  }

  /**
   * The institute row the calling admin works in — same shape as
   * `findOne()` but keyed on the actor's own `instituteId` rather than a
   * path param. The institute's own admin sees the same identity the
   * superadmin sees for them, with the same selective fields, so the
   * "edit institute" dialog on /admin/organization can reuse the same
   * form without inventing a second type.
   *
   * Throws Forbidden for a SUPERADMIN session (no `instituteId` — those
   * users have no tenant), and NotFound if the institute has been deleted
   * in the gap between sign-in and this call. The latter is the same
   * response the user got before the addition of this method, so a stale
   * session token does not suddenly start erroring differently.
   */
  async myInstitute(userInstituteId: string | null) {
    if (!userInstituteId) {
      throw new ForbiddenException(
        'No institute is associated with this session.',
      );
    }
    const institute = await this.prisma.institute.findUnique({
      where: { id: userInstituteId },
      select: summarySelect,
    });
    if (!institute) {
      throw new NotFoundException('Institute not found');
    }
    return this.withLogo(institute);
  }

  /**
   * The matching self-edit: rename the calling admin's own institute, no
   * path param. The actor-side guard is the only tenant boundary here —
   * there is no id from the URL to read, so a 404-via-wrong-id probe is
   * structurally impossible.
   *
   * `isActive` is intentionally NOT editable here: a tenant that wants to
   * suspend or restore itself still has to go through the superadmin door.
   * Self-deactivation would let any institute disable its own students'
   * logins without accountability, and the broader product is the
   * SUPERADMIN console's job, not a single institute's.
   */
  async updateMyInstitute(
    userInstituteId: string | null,
    dto: UpdateMyInstituteDto,
  ) {
    if (!userInstituteId) {
      throw new ForbiddenException(
        'No institute is associated with this session.',
      );
    }
    // `null` clears the logo (falls back to default); a key must belong to
    // THIS institute's own media library — otherwise any admin could brand
    // their tenant with an image key borrowed from somewhere else.
    if (dto.logoKey) {
      const owned = await this.prisma.media.findFirst({
        where: { key: dto.logoKey, instituteId: userInstituteId },
        select: { id: true },
      });
      if (!owned) {
        throw new NotFoundException(
          'That image was not found in your institute’s media library — upload it first.',
        );
      }
    }
    const institute = await this.prisma.institute.update({
      where: { id: userInstituteId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.logoKey === undefined ? {} : { logoKey: dto.logoKey }),
      },
      select: summarySelect,
    });
    return this.withLogo(institute);
  }

  /**
   * Permanently remove a tenant.
   *
   * Refused while the tenant still holds exam records: deleting one would take
   * every candidate's result with it, and there is no undo. Suspending
   * (isActive:false) is the reversible option and the error says so.
   */
  async remove(id: string, force = false) {
    await this.mustExist(id);
    const stats = (await this.statsByInstitute(id)).get(id) ?? emptyStats();

    const holdsRecords = stats.students + stats.exams + stats.attempts > 0;
    if (holdsRecords && !force) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'InstituteNotEmpty',
        message:
          `This institute still holds ${stats.students} student(s), ` +
          `${stats.exams} exam(s) and ${stats.attempts} attempt(s). Deleting it ` +
          `removes all of them permanently. Suspend it instead, or re-send with ` +
          `force=true to delete anyway.`,
        stats,
      });
    }

    await this.prisma.institute.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async mustExist(id: string) {
    const found = await this.prisma.institute.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Institute not found');
  }

  /**
   * Per-tenant record counts. Grouping once per entity keeps this at a fixed
   * number of queries no matter how many tenants exist.
   */
  private async statsByInstitute(only?: string) {
    const where = only ? { instituteId: only } : {};
    const [students, exams, questions, attempts, staff] = await Promise.all([
      this.prisma.student.groupBy({
        by: ['instituteId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.exam.groupBy({
        by: ['instituteId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.question.groupBy({
        by: ['instituteId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attempt.groupBy({
        by: ['instituteId'],
        where: { ...where, status: { notIn: PRE_START_ATTEMPT_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['instituteId'],
        where: { ...where, roles: { hasSome: ['ADMIN', 'TEACHER'] } },
        _count: { _all: true },
      }),
    ]);

    const map = new Map<string, ReturnType<typeof emptyStats>>();
    const put = (
      rows: { instituteId: string | null; _count: { _all: number } }[],
      key: keyof ReturnType<typeof emptyStats>,
    ) => {
      for (const row of rows) {
        if (!row.instituteId) continue;
        const current = map.get(row.instituteId) ?? emptyStats();
        current[key] = row._count._all;
        map.set(row.instituteId, current);
      }
    };
    put(students, 'students');
    put(exams, 'exams');
    put(questions, 'questions');
    put(attempts, 'attempts');
    put(staff, 'staff');
    return map;
  }
}

function emptyStats() {
  return { students: 0, exams: 0, questions: 0, attempts: 0, staff: 0 };
}
