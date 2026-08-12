export interface StoredObject {
  /** Storage key — the only pointer the database keeps (§2.7). */
  key: string;
}

/**
 * Media storage port (§2.6/§2.7) — abstract class used as the DI token, so the
 * storage backend can change without touching the service.
 *
 * Adapters:
 *   - S3MediaAdapter    — production. Active when the AWS_* env vars are set.
 *   - LocalMediaAdapter — development fallback, writes under the API's own
 *     storage directory. Infrastructure (and therefore the bucket) is the
 *     client's responsibility per §4/§14, so the platform has to run without
 *     credentials until they are provisioned.
 */
export abstract class MediaStoragePort {
  /** Human-readable backend name, surfaced in health/debug output. */
  abstract readonly name: string;

  /** Store bytes under a tenant-scoped key. */
  abstract put(params: {
    instituteId: string;
    fileName: string;
    mimeType: string;
    body: Buffer;
  }): Promise<StoredObject>;

  /** Read bytes back. Null when the object is missing. */
  abstract get(key: string): Promise<Buffer | null>;

  /** Remove an object. Missing objects are not an error. */
  abstract remove(key: string): Promise<void>;

  /**
   * A URL the browser can fetch directly, when the backend offers one (S3/CDN).
   * Null means "no direct URL — stream it through the API instead".
   */
  abstract publicUrl(key: string): string | null;
}
