import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MediaKind } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '../auth/auth.types';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { MediaStoragePort } from './ports/media-storage.port';

/**
 * Media module (§2.7).
 *
 * Questions reference media BY KEY; the bytes live in object storage behind
 * MediaStoragePort. Records carry institute_id and follow the same isolation
 * rules as the rest of the platform — a key from another tenant is a 404, not
 * a leak.
 */

/** Diagrams and photographs — what a question can embed and render. */
const ALLOWED_IMAGES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

/**
 * Documents — what a notice or a resource can carry.
 *
 * Deliberately a short list of things a browser or a phone can open without
 * help. Anything executable is absent on purpose: these files are handed
 * straight to students, so the upload is the boundary at which "an admin can
 * distribute anything" has to stop.
 */
const ALLOWED_DOCUMENTS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // A scan of a worksheet is a photograph, and refusing it here would send
  // people back to the question picker, which is the wrong place for it.
  'image/png',
  'image/jpeg',
]);

/** A diagram renders inline, so it stays small. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** A document is downloaded, not rendered; a scanned paper runs large. */
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const LABELS: Record<MediaKind, string> = {
  IMAGE: 'PNG, JPEG, WebP, GIF or SVG',
  DOCUMENT: 'PDF, Word, Excel, PowerPoint, TXT, CSV, PNG or JPEG',
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly storage: MediaStoragePort,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new ForbiddenException('No institute in the current context');
    }
    return { instituteId: ctx.instituteId, userId: ctx.userId };
  }

  async upload(
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    altText?: string,
    kind: MediaKind = MediaKind.IMAGE,
  ) {
    const { instituteId, userId } = this.ctx();

    const allowed =
      kind === MediaKind.DOCUMENT ? ALLOWED_DOCUMENTS : ALLOWED_IMAGES;
    const maxBytes =
      kind === MediaKind.DOCUMENT ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
    const noun = kind === MediaKind.DOCUMENT ? 'File' : 'Image';

    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException(
        `${noun} type "${file.mimetype}" is not accepted here. ` +
          `Allowed: ${LABELS[kind]}.`,
      );
    }
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `${noun} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ` +
          `${maxBytes / 1024 / 1024} MB.`,
      );
    }

    const { key } = await this.storage.put({
      instituteId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      body: file.buffer,
    });

    const row = await this.prisma.media.create({
      data: {
        instituteId,
        key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        kind,
        size: file.size,
        altText: altText ?? null,
        uploadedById: userId,
      },
      select: this.select,
    });
    return this.decorate(row);
  }

  async list() {
    const { instituteId } = this.ctx();
    const rows = await this.prisma.media.findMany({
      where: { instituteId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: this.select,
    });
    return {
      items: rows.map((r) => this.decorate(r)),
      storage: this.storage.name,
    };
  }

  /** Bytes for a key this tenant owns. Used when there is no CDN in front. */
  async read(key: string) {
    const { instituteId } = this.ctx();
    const row = await this.prisma.media.findFirst({
      where: { instituteId, key },
      select: { key: true, mimeType: true, fileName: true, kind: true },
    });
    if (!row) throw new NotFoundException('Media not found');
    await this.assertReadableByCaller(row.key);
    const body = await this.storage.get(row.key);
    if (!body)
      throw new NotFoundException('Media file is missing from storage');
    return { ...row, body };
  }

  /**
   * Staff may read any of their institute's media — that is their library.
   * A candidate may only read a diagram they are entitled to see.
   *
   * Tenant scoping alone was letting any student fetch any key in their own
   * institute, including diagrams from papers they were never assigned, given
   * a guessed UUID. Entitlement is checked against a `Response` row rather than
   * the exam: one is created for every question the moment a candidate starts
   * that paper, so it covers the live exam and the later review with a single
   * condition, and it excludes papers they never sat. Practice-library
   * questions are open to any candidate by design.
   *
   * A denial is a 404, matching every other not-visible-in-your-scope lookup —
   * it does not confirm that the key exists.
   */
  private async assertReadableByCaller(key: string): Promise<void> {
    const ctx = this.tenant.get();
    if (ctx?.role !== Role.STUDENT) return;

    /**
     * The institute's own logo (§ institute branding) — every member may
     * see it by definition, no further entitlement to check. Cheapest
     * check first: this is the common case once a tenant has branded
     * itself, and every other check below does at least one more query.
     */
    const isOwnLogo = await this.prisma.institute.findFirst({
      where: { id: ctx.instituteId ?? undefined, logoKey: key },
      select: { id: true },
    });
    if (isOwnLogo) return;

    const student = await this.prisma.student.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Not a student account');

    const entitled = await this.prisma.question.findFirst({
      where: {
        instituteId: ctx.instituteId ?? undefined,
        mediaKeys: { has: key },
        OR: [
          { inPracticeLibrary: true },
          { responses: { some: { attempt: { studentId: student.id } } } },
        ],
      },
      select: { id: true },
    });
    if (entitled) return;

    /**
     * Or an attachment on a notice actually addressed to them.
     *
     * The same three conditions the student announcement feed applies, and for
     * the same reason: a notice that is still a draft, has expired, or is aimed
     * at another batch is not theirs to read, and neither is the file on it.
     * Repeating the rule here rather than trusting the feed is the point —
     * this route is reachable with nothing but a guessed key.
     */
    const now = new Date();
    const onATheirNotice = await this.prisma.announcement.findFirst({
      where: {
        instituteId: ctx.instituteId ?? undefined,
        attachmentKeys: { has: key },
        publishedAt: { not: null, lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            toStudents: true,
            // No batch rows means the notice went to every student; otherwise
            // only the batches named on it. Mirrors visibleToMeWhere() in
            // announcements.service.ts — deliberately duplicated, see above.
            OR: [
              { batches: { none: {} } },
              { batches: { some: { batchId: student.batchId } } },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (onATheirNotice) return;

    /**
     * Or study material shared with their batch.
     *
     * The batch is the whole permission. A resource now reaches a SET of
     * batches, so this asks whether any of them is theirs — the same question
     * as before, just no longer answerable by comparing one column.
     */
    const sharedWithTheirBatch = await this.prisma.resource.findFirst({
      where: {
        instituteId: ctx.instituteId ?? undefined,
        mediaKey: key,
        batches: { some: { batchId: student.batchId } },
      },
      select: { id: true },
    });
    if (sharedWithTheirBatch) return;

    throw new NotFoundException('Media not found');
  }

  async remove(id: string, confirm?: boolean) {
    const { instituteId } = this.ctx();
    const row = await this.prisma.media.findFirst({
      where: { id, instituteId },
      select: { id: true, key: true },
    });
    if (!row) throw new NotFoundException('Media not found');

    // mediaKeys is a plain string[] on Question (no FK), so the database
    // cannot stop this on its own — a diagram question is unanswerable
    // without its image (§2.7), so deleting one still embedded in a
    // question would silently break it, live exam or not.
    if (!confirm) {
      const usedIn = await this.prisma.question.findMany({
        where: { instituteId, mediaKeys: { has: row.key } },
        select: { id: true, statement: true, status: true },
      });
      if (usedIn.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'MediaUsedInQuestions',
          message:
            'This image is still attached to one or more questions. Deleting ' +
            'it will leave them without their diagram. Re-send with ' +
            'confirm=true to delete anyway.',
          affectedQuestions: usedIn.map((q) => ({
            id: q.id,
            statement: q.statement.slice(0, 80),
            status: q.status,
          })),
        });
      }
    }

    /**
     * Detach the key from every question still carrying it.
     *
     * `mediaKeys` is a plain `String[]` with no foreign key, so nothing in the
     * database does this. Left behind, the key survives the image: the question
     * keeps asking the browser for a file that no longer exists and renders
     * "Image unavailable" forever — on a diagram question, permanently
     * unanswerable — and the dead key propagates into every exam that reuses it.
     *
     * Raw SQL because Prisma has no "remove one element from a scalar list"
     * operation: `array_remove` does it in a single statement rather than
     * read-modify-write per row, which would race a concurrent question edit.
     */
    const detached = await this.prisma.$executeRaw`
      UPDATE "questions"
         SET "media_keys" = array_remove("media_keys", ${row.key})
       WHERE "institute_id" = ${instituteId}::uuid
         AND ${row.key} = ANY("media_keys")`;

    // Remove the record before the object: a stray object is harmless, a record
    // pointing at nothing is not.
    await this.prisma.media.delete({ where: { id: row.id } });
    await this.storage.remove(row.key);
    return { id: row.id, deleted: true, detachedFromQuestions: detached };
  }

  private readonly select = {
    id: true,
    key: true,
    fileName: true,
    mimeType: true,
    size: true,
    altText: true,
    createdAt: true,
    uploadedBy: { select: { name: true } },
  } as const;

  /** Attach the direct URL when the backend has one, else the API route. */
  private decorate<T extends { key: string }>(row: T) {
    return {
      ...row,
      url:
        this.storage.publicUrl(row.key) ??
        `/media/file/${encodeURIComponent(row.key)}`,
    };
  }
}
