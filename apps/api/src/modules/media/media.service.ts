import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
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

/** Diagrams and photographs only — questions embed images, nothing else. */
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_BYTES = 5 * 1024 * 1024;

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
  ) {
    const { instituteId, userId } = this.ctx();

    if (!ALLOWED.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported image type "${file.mimetype}". Allowed: PNG, JPEG, WebP, GIF, SVG.`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_BYTES / 1024 / 1024} MB.`,
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
      select: { key: true, mimeType: true, fileName: true },
    });
    if (!row) throw new NotFoundException('Media not found');
    const body = await this.storage.get(row.key);
    if (!body)
      throw new NotFoundException('Media file is missing from storage');
    return { ...row, body };
  }

  async remove(id: string) {
    const { instituteId } = this.ctx();
    const row = await this.prisma.media.findFirst({
      where: { id, instituteId },
      select: { id: true, key: true },
    });
    if (!row) throw new NotFoundException('Media not found');
    // Remove the record first: a stray object is harmless, a record pointing
    // at nothing is not.
    await this.prisma.media.delete({ where: { id: row.id } });
    await this.storage.remove(row.key);
    return { id: row.id, deleted: true };
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
