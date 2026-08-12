import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MediaStoragePort, StoredObject } from '../ports/media-storage.port';

/**
 * S3 media storage (§2.7) — the production adapter.
 *
 * The AWS SDK is loaded lazily so the package is only required when a bucket is
 * actually configured; the platform ships and runs without it (infrastructure
 * is the client's responsibility, §4/§14). Install `@aws-sdk/client-s3` and set
 * AWS_S3_BUCKET / AWS_REGION / credentials to activate.
 *
 * Objects are served from the CDN when MEDIA_CDN_URL is set, matching the
 * contract's "served via CDN; questions reference media by key".
 */
@Injectable()
export class S3MediaAdapter extends MediaStoragePort {
  readonly name = 's3';
  private readonly logger = new Logger(S3MediaAdapter.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnUrl: string | null;
  /** Typed loosely: the SDK is an optional peer, resolved at runtime. */
  private client: unknown = null;

  constructor(private readonly config: ConfigService) {
    super();
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') ?? '';
    this.region = this.config.get<string>('AWS_REGION') ?? 'ap-south-1';
    this.cdnUrl = this.config.get<string>('MEDIA_CDN_URL') ?? null;
  }

  private async sdk(): Promise<{
    client: { send: (cmd: unknown) => Promise<unknown> };
    PutObjectCommand: new (i: unknown) => unknown;
    GetObjectCommand: new (i: unknown) => unknown;
    DeleteObjectCommand: new (i: unknown) => unknown;
  }> {
    // Indirect specifier: the SDK is an OPTIONAL dependency, so the import
    // must not be resolved at compile time on installs that don't have it.
    const specifier = '@aws-sdk/client-s3';
    const mod = (await (import(specifier) as Promise<unknown>)) as {
      S3Client: new (cfg: unknown) => {
        send: (cmd: unknown) => Promise<unknown>;
      };
      PutObjectCommand: new (i: unknown) => unknown;
      GetObjectCommand: new (i: unknown) => unknown;
      DeleteObjectCommand: new (i: unknown) => unknown;
    };
    this.client ??= new mod.S3Client({ region: this.region });
    return {
      client: this.client as { send: (cmd: unknown) => Promise<unknown> },
      PutObjectCommand: mod.PutObjectCommand,
      GetObjectCommand: mod.GetObjectCommand,
      DeleteObjectCommand: mod.DeleteObjectCommand,
    };
  }

  async put(params: {
    instituteId: string;
    fileName: string;
    mimeType: string;
    body: Buffer;
  }): Promise<StoredObject> {
    const ext = params.fileName.includes('.')
      ? params.fileName.slice(params.fileName.lastIndexOf('.'))
      : '';
    const key = `${params.instituteId}/${randomUUID()}${ext}`;
    const { client, PutObjectCommand } = await this.sdk();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: params.body,
        ContentType: params.mimeType,
      }),
    );
    return { key };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const { client, GetObjectCommand } = await this.sdk();
      const res = (await client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } };
      const bytes = await res.Body?.transformToByteArray?.();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      this.logger.warn(`S3 get failed for ${key}: ${String(err)}`);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    const { client, DeleteObjectCommand } = await this.sdk();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  publicUrl(key: string): string | null {
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    if (!this.bucket) return null;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
