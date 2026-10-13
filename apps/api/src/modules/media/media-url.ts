import { MediaStoragePort } from './ports/media-storage.port';

/**
 * A key as something the browser can load (§2.7): the CDN URL when the backend
 * has one, otherwise the API's own streaming route. The one place this is
 * decided, so a stem image and an option image can never resolve differently.
 */
export function mediaUrl(storage: MediaStoragePort, key: string): string {
  return storage.publicUrl(key) ?? `/media/file/${encodeURIComponent(key)}`;
}

/**
 * Add a server-resolved `mediaUrl` to every option that carries an image.
 *
 * Only `mediaKey` and `mediaUrl` travel with the image — never its file name or
 * alt text, which a student must not see (an upload called "answer-B.png"
 * would give the answer away). Options without an image, and any value that is
 * not an option list, pass through untouched.
 */
export function withOptionMediaUrls<T>(
  storage: MediaStoragePort,
  options: T,
): T {
  if (!Array.isArray(options)) return options;
  return options.map((o: unknown) => {
    const key = (o as { mediaKey?: unknown } | null)?.mediaKey;
    return typeof key === 'string' && key
      ? { ...(o as object), mediaUrl: mediaUrl(storage, key) }
      : o;
  }) as T;
}
