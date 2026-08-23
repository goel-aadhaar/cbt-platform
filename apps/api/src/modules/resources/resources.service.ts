import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { Role } from '../auth/auth.types';
import { TeacherScopeService } from '../auth/tenant/teacher-scope.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';

/**
 * Study material, filed by subject and addressed to a batch (§2.12).
 *
 * Three audiences, three different questions:
 *  - a STUDENT asks "what has been shared with me", and must never see another
 *    batch's material;
 *  - a TEACHER asks "what have my batches got", and may only publish into
 *    batches they actually teach;
 *  - an ADMIN sees the whole institute, because they are responsible for it.
 *
 * The batch filter is therefore applied on the server for every read, not
 * offered as a query parameter the client may forget to send.
 */

const listSelect = {
  id: true,
  title: true,
  description: true,
  mediaKey: true,
  createdAt: true,
  subject: { select: { id: true, name: true } },
  batch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

@Injectable()
export class ResourcesService {
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
    return { instituteId: ctx.instituteId, userId: ctx.userId, role: ctx.role };
  }

  /**
   * Everything the caller is entitled to see, newest first.
   *
   * `subjectId` narrows to one shelf; it is a convenience, never the security
   * boundary — that is the batch filter below, which the caller cannot widen.
   */
  async list(subjectId?: string) {
    const { instituteId, role, userId } = this.ctx();

    let batchFilter: { batchId: { in: string[] } } | undefined;
    if (role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId },
        select: { batchId: true },
      });
      if (!student) throw new ForbiddenException('Not a student account');
      batchFilter = { batchId: { in: [student.batchId] } };
    } else {
      const mine = await this.teacherScope.myBatchIds();
      // `[]` is a real filter — a teacher assigned no batches sees nothing.
      // Treating it as falsy would show them the whole institute.
      if (mine !== null) batchFilter = { batchId: { in: mine } };
    }

    const rows = await this.prisma.resource.findMany({
      where: {
        instituteId,
        ...(subjectId ? { subjectId } : {}),
        ...(batchFilter ?? {}),
      },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });

    // Filenames and sizes live on the media rows; joined here rather than
    // duplicated onto every resource, so a renamed file stays consistent.
    const media = await this.prisma.media.findMany({
      where: { instituteId, key: { in: rows.map((r) => r.mediaKey) } },
      select: { key: true, fileName: true, size: true, mimeType: true },
    });
    const byKey = new Map(media.map((m) => [m.key, m]));

    return rows.map((r) => ({
      ...r,
      file: byKey.get(r.mediaKey) ?? null,
    }));
  }

  /** The subjects that actually have something on their shelf, with counts. */
  async shelves() {
    const all = await this.list();
    const counts = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const r of all) {
      const entry = counts.get(r.subject.id) ?? {
        id: r.subject.id,
        name: r.subject.name,
        count: 0,
      };
      entry.count += 1;
      counts.set(r.subject.id, entry);
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(dto: CreateResourceDto) {
    const { instituteId, userId } = this.ctx();
    await this.assertCanPublishTo(dto.batchId, instituteId);

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, instituteId },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException(
        'That subject does not exist in your institute. Reload and try again.',
      );
    }

    // The file must be a document this institute owns. Without this a caller
    // could file another tenant's key, and every student in the batch would
    // then be entitled to download it.
    const file = await this.prisma.media.findFirst({
      where: { instituteId, key: dto.mediaKey, kind: 'DOCUMENT' },
      select: { key: true },
    });
    if (!file) {
      throw new BadRequestException(
        'That file is not in your institute’s library. Upload it again and retry.',
      );
    }

    return this.prisma.resource.create({
      data: {
        instituteId,
        subjectId: dto.subjectId,
        batchId: dto.batchId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        mediaKey: dto.mediaKey,
        createdById: userId,
      },
      select: listSelect,
    });
  }

  async update(id: string, dto: UpdateResourceDto) {
    const { instituteId } = this.ctx();
    const existing = await this.requireOwn(id, instituteId);

    if (dto.batchId && dto.batchId !== existing.batchId) {
      await this.assertCanPublishTo(dto.batchId, instituteId);
    }

    return this.prisma.resource.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.batchId !== undefined ? { batchId: dto.batchId } : {}),
      },
      select: listSelect,
    });
  }

  /**
   * Unshare a resource.
   *
   * The file itself is left in the media library. Deleting the bytes here
   * would break any other resource or notice pointing at the same key, and
   * removing something from a shelf is not the same act as destroying it.
   */
  async remove(id: string) {
    const { instituteId } = this.ctx();
    await this.requireOwn(id, instituteId);
    await this.prisma.resource.delete({ where: { id } });
    return { removed: id };
  }

  /**
   * A teacher may only publish into a batch they teach.
   *
   * Without this, batch selection would be a dropdown rather than a
   * permission: a teacher could hand material to any batch in the institute
   * simply by sending a different id.
   */
  private async assertCanPublishTo(batchId: string, instituteId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, instituteId },
      select: { id: true, name: true },
    });
    if (!batch) {
      throw new BadRequestException(
        'That batch does not exist in your institute. Reload and try again.',
      );
    }

    const mine = await this.teacherScope.myBatchIds();
    if (mine !== null && !mine.includes(batchId)) {
      throw new ForbiddenException(
        `You do not teach ${batch.name}, so you cannot share material with it. ` +
          'Ask an administrator to assign you to the batch first.',
      );
    }
  }

  /** Scoped lookup — a teacher cannot edit another batch's material. */
  private async requireOwn(id: string, instituteId: string) {
    const row = await this.prisma.resource.findFirst({
      where: { id, instituteId },
      select: { id: true, batchId: true },
    });
    if (!row) throw new NotFoundException('Resource not found');

    const mine = await this.teacherScope.myBatchIds();
    if (mine !== null && !mine.includes(row.batchId)) {
      // A 404 rather than a 403: confirming it exists would tell a teacher
      // what other batches hold, which is the thing being withheld.
      throw new NotFoundException('Resource not found');
    }
    return row;
  }
}
