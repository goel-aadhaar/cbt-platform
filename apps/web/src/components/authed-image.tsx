"use client";

import { useEffect, useState, type ReactNode } from "react";

import { getToken } from "@/lib/auth";
import { mediaSrc } from "@/lib/media";

/**
 * Shared object-URL cache.
 *
 * Two layers:
 *  1. Ref counting — the media library grid can render up to 200 of these at
 *     once and the same key often appears twice on one screen, so there is one
 *     in-flight fetch per resolved URL and the blob is only released once
 *     nothing on screen points at it.
 *  2. A module-level LRU of idle entries (refCount 0) — during an exam a
 *     student moves back and forth between questions; without it every revisit
 *     re-fetched the same bytes (and a single throttled request left a
 *     permanent "Image unavailable"). Idle entries are kept up to
 *     `MAX_IDLE_ENTRIES` / `MAX_CACHE_BYTES` and the oldest are revoked first.
 */
interface ImageCacheEntry {
  promise: Promise<string>;
  refCount: number;
  objectUrl: string | null;
  size: number;
}

const MAX_IDLE_ENTRIES = 80;
const MAX_CACHE_BYTES = 60 * 1024 * 1024;
const RETRY_DELAYS_MS = [400, 1200, 3000];

// Map iteration order is insertion order, so re-inserting on use makes the
// first entry the least recently used.
const imageCache = new Map<string, ImageCacheEntry>();
let cachedBytes = 0;

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpStatusError) {
    return err.status === 429 || err.status >= 500;
  }
  return true;
}

async function fetchBlobWithRetry(resolvedUrl: string): Promise<Blob> {
  for (let attempt = 0; ; attempt++) {
    try {
      const token = getToken();
      const res = await fetch(
        resolvedUrl,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {},
      );
      if (!res.ok) throw new HttpStatusError(res.status);
      return await res.blob();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function evictIdle(): void {
  let idleCount = 0;
  for (const entry of imageCache.values()) {
    if (entry.refCount <= 0 && entry.objectUrl) idleCount++;
  }
  for (const [url, entry] of imageCache) {
    if (idleCount <= MAX_IDLE_ENTRIES && cachedBytes <= MAX_CACHE_BYTES) break;
    if (entry.refCount > 0 || !entry.objectUrl) continue;
    URL.revokeObjectURL(entry.objectUrl);
    cachedBytes -= entry.size;
    imageCache.delete(url);
    idleCount--;
  }
}

function acquireImage(resolvedUrl: string): Promise<string> {
  const existing = imageCache.get(resolvedUrl);
  if (existing) {
    existing.refCount++;
    imageCache.delete(resolvedUrl);
    imageCache.set(resolvedUrl, existing);
    return existing.promise;
  }
  const entry: ImageCacheEntry = {
    refCount: 1,
    objectUrl: null,
    size: 0,
    promise: fetchBlobWithRetry(resolvedUrl).then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      entry.objectUrl = objectUrl;
      entry.size = blob.size;
      cachedBytes += blob.size;
      evictIdle();
      return objectUrl;
    }),
  };
  entry.promise.catch(() => {
    // Never cache a failure: a later mount or the Retry button must refetch.
    if (imageCache.get(resolvedUrl) === entry) imageCache.delete(resolvedUrl);
  });
  imageCache.set(resolvedUrl, entry);
  return entry.promise;
}

function releaseImage(resolvedUrl: string): void {
  const entry = imageCache.get(resolvedUrl);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) evictIdle();
}

const isAbsolute = (url: string) => /^https?:\/\//i.test(url);

function preloadDirect(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

function cacheHasRoom(): boolean {
  let idleCount = 0;
  for (const entry of imageCache.values()) {
    if (entry.refCount <= 0 && entry.objectUrl) idleCount++;
  }
  return (
    idleCount < MAX_IDLE_ENTRIES - 2 && cachedBytes < MAX_CACHE_BYTES * 0.9
  );
}

/**
 * Warm the cache for images that will be needed soon, three at a time, in the
 * order given. Failures are ignored (the on-screen component retries itself)
 * and warming stops once the cache is nearly full, so it can never push out
 * the images the student is about to see.
 */
export function prefetchAuthedImages(urls: string[]): Promise<void> {
  const queue = Array.from(new Set(urls.filter(Boolean)));
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const url = queue[next++];
      if (isAbsolute(url)) {
        await preloadDirect(url);
        continue;
      }
      if (!cacheHasRoom()) return;
      const resolved = mediaSrc(url);
      try {
        await acquireImage(resolved);
      } catch {
        continue;
      }
      releaseImage(resolved);
    }
  };
  return Promise.all([worker(), worker(), worker()]).then(() => undefined);
}

/**
 * `<img>` cannot send an Authorization header, and `GET /media/file/:key`
 * (the fallback route used whenever there's no CDN/S3 in front of media —
 * i.e. always in dev) requires one. A bare `<img src={mediaSrc(url)}>` on
 * that route 401s and never renders. This fetches the bytes with the
 * bearer token and hands the browser an object URL instead — same shape as
 * the existing authenticated-download pattern (`downloadResultExport` in
 * `lib/admin.ts`), just for display instead of a save-as.
 *
 * A `url` that's already absolute (S3/CDN — `mediaSrc` passes those through
 * unchanged) loads directly with no fetch, since those are public.
 */
export function AuthedImage({
  url,
  alt,
  className,
  fallback,
  placeholderClassName,
  showRetry,
}: {
  url: string;
  alt: string;
  className?: string;
  /** Rendered instead of the "Image unavailable" placeholder on a fetch
   * failure — for a persistent UI element (e.g. a brand mark) where a
   * broken-image box would be worse than quietly falling back. */
  fallback?: ReactNode;
  /** Classes for the loading / unavailable boxes when they should differ from
   * `className` (e.g. a reserved height so the layout does not jump when an
   * image whose `className` only sets a max size finishes loading). */
  placeholderClassName?: string;
  /** Offer a Retry button on the unavailable box. */
  showRetry?: boolean;
}) {
  const resolved = mediaSrc(url);
  const isDirect = isAbsolute(url);
  const [loaded, setLoaded] = useState<{ url: string; src: string } | null>(
    null,
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isDirect) return;
    let cancelled = false;
    acquireImage(resolved)
      .then((objectUrl) => {
        if (!cancelled) setLoaded({ url: resolved, src: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(resolved);
      });
    return () => {
      cancelled = true;
      releaseImage(resolved);
    };
  }, [resolved, isDirect, attempt]);

  const boxClass = placeholderClassName ?? className ?? "";

  if (!isDirect && failedUrl === resolved) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-admin-surface text-[10px] text-admin-subtle ${boxClass}`}
      >
        <span>Image unavailable</span>
        {showRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFailedUrl(null);
              setAttempt((n) => n + 1);
            }}
            className="rounded border border-line bg-white px-2 py-1 text-xs font-semibold text-admin-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-indigo"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const src = isDirect
    ? resolved
    : loaded && loaded.url === resolved
      ? loaded.src
      : null;
  if (!src) {
    return <div className={`animate-pulse bg-admin-line/20 ${boxClass}`} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
