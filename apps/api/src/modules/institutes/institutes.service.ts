import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { UpdateInstituteDto } from './dto/update-institute.dto';

/** Shape returned for every tenant row in the superadmin console. */
const summarySelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  createdAt: true,
} as const;

/**
 * Tenant administration — superadmin only.
 *
 * Institute is the tenant root (§2.1), so unlike every other service this one
 * deliberately reads across tenants. It is reachable only through
 * @Roles(SUPERADMIN) routes, and a superadmin carries no instituteId of its own.
 */
@Injectable()
export class InstitutesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInstituteDto) {
    const existing = await this.prisma.institute.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Institute slug '${dto.slug}' is already taken`,
      );
    }
    return this.prisma.institute.create({
      data: { name: dto.name, slug: dto.slug },
      select: summarySelect,
    });
  }

  /**
   * Every tenant with the counts that say whether it is actually being used.
   *
   * The counts come from a single grouped pass per entity rather than a query
   * per institute, so the list does not degrade as tenants are added.
   */
  async findAll(params: { search?: string; includeInactive?: boolean } = {}) {
    const where = {
      ...(params.includeInactive === false ? { isActive: true } : {}),
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

    return {
      items: institutes.map((i) => ({
        ...i,
        stats: stats.get(i.id) ?? emptyStats(),
      })),
      total: institutes.length,
    };
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
        where: { instituteId: id, role: { in: ['ADMIN', 'TEACHER'] } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.attempt.findFirst({
        where: { instituteId: id },
        select: { startedAt: true },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    return {
      ...institute,
      stats: stats.get(id) ?? emptyStats(),
      staff,
      lastActivityAt: lastAttempt?.startedAt ?? null,
    };
  }

  async update(id: string, dto: UpdateInstituteDto) {
    await this.mustExist(id);
    return this.prisma.institute.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: summarySelect,
    });
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
        where,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['instituteId'],
        where: { ...where, role: { in: ['ADMIN', 'TEACHER'] } },
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
