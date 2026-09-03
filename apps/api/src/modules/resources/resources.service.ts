import {
  BadRequestException,
  ConflictException,
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
  CreateResourceDto,
  QueryResourcesDto,
  ResourceType,
  UpdateResourceDto,
} from './dto/resource.dto';
import { youtubeVideoId } from './youtube';

/**
 * Study material, filed Subject > Chapter > Resource and addressed to batches
 * (§2.12).
 *
 * Three audiences, three different questions:
 *  - a STUDENT asks "what has been shared with me", and must never see another
 *    batch's material;
 *  - a TEACHER asks "what have my batches got", and may only publish into
 *    batches they actually teach;
 *  - an ADMIN sees the whole institute, because they are responsible for it.
 *
 * `visibleWhere()` answers that once and every read goes through it, so the
 * batch filter is never a query parameter the client could omit.
 */

const listSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  mediaKey: true,
  youtubeVideoId: true,
  createdAt: true,
  subject: { select: { id: true, name: true } },
  chapter: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  batches: { select: { batch: { select: { id: true, name: true } } } },
} satisfies Prisma.ResourceSelect;

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
   * The single source of "what may this caller see".
   *
   * Every list, every count and every by-id read composes this. Written once
   * because a counts query that disagreed with the list it labels is worse
   * than no counts — a student told a chapter holds 3 items and shown 1 has
   * been given a reason to think the platform lost their material.
   */
  private async visibleWhere(): Promise<Prisma.ResourceWhereInput> {
    const { instituteId, role, userId } = this.ctx();

    if (role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId },
        select: { batchId: true },
      });
      if (!student) throw new ForbiddenException('Not a student account');
      return {
        instituteId,
        batches: { some: { batchId: student.batchId } },
      };
    }

    const mine = await this.teacherScope.myBatchIds();
    // `[]` is a real filter — a teacher assigned no batches sees nothing.
    // Treating it as falsy would show them the whole institute.
    if (mine !== null) {
      return { instituteId, batches: { some: { batchId: { in: mine } } } };
    }
    return { instituteId };
  }

  /** Narrowing the caller asked for, on top of what they may see. */
  private filters(query: QueryResourcesDto): Prisma.ResourceWhereInput {
    const q = query.q?.trim();
    return {
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.type ? { type: query.type } : {}),
      // Server-side so a search never pulls the whole library to the client
      // and filters it there, which would also leak counts.
      //
      // Subject and chapter names are searched too: someone who types
      // "kinematics" is naming where the material lives, not quoting a title,
      // and matching only titles would return nothing for the most natural
      // thing to search for.
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
              {
                subject: {
                  name: { contains: q, mode: 'insensitive' as const },
                },
              },
              {
                chapter: {
                  name: { contains: q, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };
  }

  /** Everything the caller may see, newest first, optionally narrowed. */
  async list(query: QueryResourcesDto = {}) {
    const { instituteId } = this.ctx();
    const rows = await this.prisma.resource.findMany({
      where: { AND: [await this.visibleWhere(), this.filters(query)] },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });
    return this.withFiles(rows, instituteId);
  }

  /**
   * Subjects that actually hold something, with real chapter and resource
   * counts.
   *
   * Counted by the database rather than by loading every row and tallying in
   * memory, which is what this did before: a library of any size made the
   * shelf page fetch itself entirely just to render a number.
   */
  async subjects() {
    const where = await this.visibleWhere();

    const grouped = await this.prisma.resource.groupBy({
      by: ['subjectId'],
      where,
      _count: { _all: true },
    });
    if (grouped.length === 0) return [];

    const ids = grouped.map((g) => g.subjectId);
    const [subjects, chapterGroups] = await Promise.all([
      this.prisma.subject.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
      // Distinct chapters holding visible material, per subject — "8 chapters"
      // must mean eight chapters with something in them, not every chapter the
      // subject happens to define.
      this.prisma.resource.groupBy({
        by: ['subjectId', 'chapterId'],
        where,
      }),
    ]);

    const chapterCount = new Map<string, number>();
    for (const g of chapterGroups) {
      chapterCount.set(g.subjectId, (chapterCount.get(g.subjectId) ?? 0) + 1);
    }
    const nameById = new Map(subjects.map((s) => [s.id, s.name]));

    return grouped
      .map((g) => ({
        id: g.subjectId,
        name: nameById.get(g.subjectId) ?? 'Unknown subject',
        chapterCount: chapterCount.get(g.subjectId) ?? 0,
        resourceCount: g._count._all,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Chapters under one subject that hold visible material, with counts.
   *
   * Material filed before chapters existed comes back under a null id, which
   * the UI labels "Unfiled" — dropping it would hide resources students can
   * still legitimately open.
   */
  async chapters(subjectId: string) {
    const where = {
      AND: [await this.visibleWhere(), { subjectId }],
    } satisfies Prisma.ResourceWhereInput;

    const grouped = await this.prisma.resource.groupBy({
      by: ['chapterId'],
      where,
      _count: { _all: true },
    });
    if (grouped.length === 0) return [];

    const ids = grouped
      .map((g) => g.chapterId)
      .filter((id): id is string => id !== null);
    const chapters = ids.length
      ? await this.prisma.chapter.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(chapters.map((c) => [c.id, c.name]));

    return grouped
      .map((g) => ({
        id: g.chapterId,
        name: g.chapterId
          ? (nameById.get(g.chapterId) ?? 'Unknown chapter')
          : 'Unfiled',
        resourceCount: g._count._all,
      }))
      .sort((a, b) => {
        // Unfiled last: it is a legacy bucket, not a chapter of the syllabus.
        if (a.id === null) return 1;
        if (b.id === null) return -1;
        return a.name.localeCompare(b.name);
      });
  }

  /** One resource, if the caller may see it. */
  async findOne(id: string) {
    const { instituteId } = this.ctx();
    const row = await this.prisma.resource.findFirst({
      where: { AND: [await this.visibleWhere(), { id }] },
      select: listSelect,
    });
    // 404 rather than 403: confirming it exists would tell a caller what other
    // batches hold, which is the thing being withheld.
    if (!row) throw new NotFoundException('Resource not found');
    const [withFile] = await this.withFiles([row], instituteId);
    return withFile;
  }

  async create(dto: CreateResourceDto) {
    const { instituteId, userId } = this.ctx();
    const batchIds = [...new Set(dto.batchIds)];

    await this.assertCanPublishTo(batchIds, instituteId);
    await this.assertHierarchy(dto.subjectId, dto.chapterId, instituteId);
    const payload = await this.assertPayload(
      dto.type,
      dto.mediaKey,
      dto.youtubeUrl,
      instituteId,
    );
    await this.assertNotDuplicate(dto.subjectId, dto.chapterId, payload);

    const created = await this.prisma.resource.create({
      data: {
        instituteId,
        createdById: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        type: dto.type,
        subjectId: dto.subjectId,
        chapterId: dto.chapterId,
        ...payload,
        batches: {
          create: batchIds.map((batchId) => ({ batchId, instituteId })),
        },
      },
      select: listSelect,
    });
    // Through withFiles() so a created resource is shaped exactly like a
    // listed one. Returning the raw row would hand the client
    // `batches: [{ batch: {...} }]` here and `batches: [{...}]` everywhere
    // else — the kind of difference that only surfaces once some caller stops
    // refetching after a save.
    const [row] = await this.withFiles([created], instituteId);
    return row;
  }

  async update(id: string, dto: UpdateResourceDto) {
    const { instituteId } = this.ctx();
    const existing = await this.requireOwn(id, instituteId);

    const batchIds = dto.batchIds ? [...new Set(dto.batchIds)] : undefined;
    if (batchIds) await this.assertCanPublishTo(batchIds, instituteId);

    // Subject and chapter move together: validating a new chapter against the
    // OLD subject would let an edit produce the mismatched pair that
    // assertHierarchy exists to prevent.
    const subjectId = dto.subjectId ?? existing.subjectId;
    const chapterId =
      dto.chapterId ?? (dto.subjectId ? undefined : existing.chapterId);
    if (dto.subjectId !== undefined || dto.chapterId !== undefined) {
      if (!chapterId) {
        throw new BadRequestException(
          'Choose a chapter for the new subject — material cannot be moved to a subject without one.',
        );
      }
      await this.assertHierarchy(subjectId, chapterId, instituteId);
    }

    const payload =
      dto.mediaKey !== undefined || dto.youtubeUrl !== undefined
        ? await this.assertPayload(
            existing.type as ResourceType,
            dto.mediaKey,
            dto.youtubeUrl,
            instituteId,
          )
        : {};

    const updated = await this.prisma.resource.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.subjectId !== undefined ? { subjectId } : {}),
        ...(chapterId !== undefined && dto.chapterId !== undefined
          ? { chapterId }
          : {}),
        ...payload,
        // Omitted leaves sharing alone; a list replaces it outright, which is
        // how a batch is removed.
        ...(batchIds
          ? {
              batches: {
                deleteMany: {},
                create: batchIds.map((batchId) => ({ batchId, instituteId })),
              },
            }
          : {}),
      },
      select: listSelect,
    });
    const [row] = await this.withFiles([updated], instituteId);
    return row;
  }

  /**
   * Unshare and delete the resource row.
   *
   * The FILE ITSELF is deliberately left in the media library. Media is shared
   * infrastructure — the same key can back a question diagram or a notice
   * attachment — so deleting bytes here could break something that has nothing
   * to do with this resource. MediaService.remove() already owns that decision,
   * including its own in-use check.
   */
  async remove(id: string) {
    const { instituteId } = this.ctx();
    await this.requireOwn(id, instituteId);
    await this.prisma.resource.delete({ where: { id } });
    return { removed: id };
  }

  /* ------------------------------ helpers ------------------------------ */

  /**
   * Filenames and sizes live on the media rows; joined here rather than
   * duplicated onto every resource, so a renamed file stays consistent.
   * One query for the whole page, not one per row.
   */
  private async withFiles(
    rows: Prisma.ResourceGetPayload<{ select: typeof listSelect }>[],
    instituteId: string,
  ) {
    const keys = rows
      .map((r) => r.mediaKey)
      .filter((k): k is string => k !== null);
    const media = keys.length
      ? await this.prisma.media.findMany({
          where: { instituteId, key: { in: keys } },
          select: { key: true, fileName: true, size: true, mimeType: true },
        })
      : [];
    const byKey = new Map(media.map((m) => [m.key, m]));

    return rows.map((r) => ({
      ...r,
      batches: r.batches.map((b) => b.batch),
      file: r.mediaKey ? (byKey.get(r.mediaKey) ?? null) : null,
    }));
  }

  /** Exactly one payload, and it must be usable. */
  private async assertPayload(
    type: ResourceType,
    mediaKey: string | undefined,
    youtubeUrl: string | undefined,
    instituteId: string,
  ) {
    if (type === ResourceType.YOUTUBE) {
      if (!youtubeUrl) {
        throw new BadRequestException('A YouTube link is required.');
      }
      const videoId = youtubeVideoId(youtubeUrl);
      if (!videoId) {
        throw new BadRequestException(
          'That is not a YouTube video link. Paste a youtube.com/watch, youtu.be or youtube.com/shorts URL.',
        );
      }
      // Only the id is stored — never the URL the teacher typed, and never
      // markup. See youtube.ts.
      return { youtubeVideoId: videoId, mediaKey: null };
    }

    if (!mediaKey) {
      throw new BadRequestException('Upload a file first.');
    }
    // The key must be a real document in THIS institute: without this, a
    // resource could be pointed at another tenant's file by key alone.
    const media = await this.prisma.media.findFirst({
      where: { instituteId, key: mediaKey, kind: 'DOCUMENT' },
      select: { id: true },
    });
    if (!media) {
      throw new BadRequestException(
        'That file is not in your institute’s library. Upload it again and retry.',
      );
    }
    return { mediaKey, youtubeVideoId: null };
  }

  /**
   * The same file or video, filed in the same chapter, twice.
   *
   * Refused rather than allowed, because a resource now reaches a SET of
   * batches: the only reason to share the same thing here again is to reach
   * another batch, and that is an edit. Two rows would give students in the
   * overlap the same lecture listed twice, and leave the teacher editing one
   * copy while the other kept its old title.
   *
   * Keyed on the payload, not the title — the same notes uploaded under two
   * names are still the same notes, and two genuinely different files may
   * reasonably share a title.
   */
  private async assertNotDuplicate(
    subjectId: string,
    chapterId: string,
    payload: { mediaKey?: string | null; youtubeVideoId?: string | null },
  ) {
    const identity = payload.youtubeVideoId
      ? { youtubeVideoId: payload.youtubeVideoId }
      : payload.mediaKey
        ? { mediaKey: payload.mediaKey }
        : null;
    if (!identity) return;

    const existing = await this.prisma.resource.findFirst({
      // Scoped through visibleWhere() so the message never reveals a resource
      // in a batch the caller cannot see — a teacher would be told to "edit"
      // something they are not allowed to open.
      where: {
        AND: [await this.visibleWhere(), { subjectId, chapterId, ...identity }],
      },
      select: { title: true },
    });
    if (existing) {
      throw new ConflictException(
        `“${existing.title}” is already shared in this chapter. ` +
          `Edit it to change which batches can see it, instead of sharing it twice.`,
      );
    }
  }

  /**
   * The chapter must belong to the subject, and both to this institute.
   *
   * They arrive as two independent ids, so nothing stops a client sending
   * Physics with a Chemistry chapter. Filing material under a hierarchy that
   * does not exist would make it unreachable by the very navigation this
   * feature is built around.
   */
  private async assertHierarchy(
    subjectId: string,
    chapterId: string,
    instituteId: string,
  ) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, subjectId, instituteId },
      select: { id: true },
    });
    if (!chapter) {
      throw new BadRequestException(
        'That chapter does not belong to the chosen subject.',
      );
    }
  }

  /** Every batch must exist here, and a teacher must actually teach it. */
  private async assertCanPublishTo(batchIds: string[], instituteId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: batchIds }, instituteId },
      select: { id: true, name: true },
    });
    if (batches.length !== batchIds.length) {
      throw new BadRequestException(
        'One or more of those batches does not exist in your institute. Reload and try again.',
      );
    }

    const mine = await this.teacherScope.myBatchIds();
    if (mine === null) return; // admin — institute-wide by definition

    const refused = batches.filter((b) => !mine.includes(b.id));
    if (refused.length > 0) {
      throw new ForbiddenException(
        `You do not teach ${refused.map((b) => b.name).join(', ')}, so you cannot share material with ` +
          `${refused.length > 1 ? 'them' : 'it'}. Ask an administrator to assign you to the batch first.`,
      );
    }
  }

  /** Scoped lookup — a teacher cannot edit another batch's material. */
  private async requireOwn(id: string, instituteId: string) {
    const row = await this.prisma.resource.findFirst({
      where: { AND: [await this.visibleWhere(), { id, instituteId }] },
      select: { id: true, type: true, subjectId: true, chapterId: true },
    });
    // A 404 rather than a 403, for the same reason as findOne().
    if (!row) throw new NotFoundException('Resource not found');
    return row;
  }
}
