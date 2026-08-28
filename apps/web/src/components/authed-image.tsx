"use client";

import { useEffect, useState, type ReactNode } from "react";

import { getToken } from "@/lib/auth";
import { mediaSrc } from "@/lib/media";

/**
 * Shared, ref-counted object-URL cache (§ rendering-cost fix).
 *
 * The media library grid (`MediaPicker`) can render up to 200 of these at
 * once, and the same key often appears twice on one screen (a question's
 * "attached" thumbnail plus its tile in the full library grid). Without a
 * cache, every `<AuthedImage>` mount fired its own independent
 * fetch-then-blob-decode for the same bytes — 200 concurrent authenticated
 * requests with no sharing. One in-flight fetch per resolved URL, keyed by
 * ref count so an object URL is only revoked once nothing on screen still
 * points at it, fixes both the duplicate network traffic and the duplicate
 * decode work.
 */
interface ImageCacheEntry {
  promise: Promise<string>;
  refCount: number;
  objectUrl: string | null;
}

const imageCache = new Map<string, ImageCacheEntry>();

function acquireImage(resolvedUrl: string): Promise<string> {
  const existing = imageCache.get(resolvedUrl);
  if (existing) {
    existing.refCount++;
    return existing.promise;
  }
  const token = getToken();
  const entry: ImageCacheEntry = {
    refCount: 1,
    objectUrl: null,
    promise: fetch(
      resolvedUrl,
      token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    )
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        // Every consumer may have already unmounted and released while this
        // was in flight — revoke rather than leak in that case.
        if (entry.refCount <= 0) {
          URL.revokeObjectURL(objectUrl);
        } else {
          entry.objectUrl = objectUrl;
        }
        return objectUrl;
      }),
  };
  imageCache.set(resolvedUrl, entry);
  return entry.promise;
}

function releaseImage(resolvedUrl: string): void {
  const entry = imageCache.get(resolvedUrl);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    imageCache.delete(resolvedUrl);
  }
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
}: {
  url: string;
  alt: string;
  className?: string;
  /** Rendered instead of the "Image unavailable" placeholder on a fetch
   * failure — for a persistent UI element (e.g. a brand mark) where a
   * broken-image box would be worse than quietly falling back. */
  fallback?: ReactNode;
}) {
  const resolved = mediaSrc(url);
  const isDirect = /^https?:\/\//i.test(url);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isDirect) return;
    let cancelled = false;
    acquireImage(resolved)
      .then((objectUrl) => {
        if (!cancelled) setObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      releaseImage(resolved);
    };
  }, [resolved, isDirect]);

  if (failed) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div
        className={`flex items-center justify-center bg-admin-surface text-[10px] text-admin-subtle ${className ?? ""}`}
      >
        Image unavailable
      </div>
    );
  }

  const src = isDirect ? resolved : objectUrl;
  if (!src) {
    return (
      <div className={`animate-pulse bg-admin-line/20 ${className ?? ""}`} />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
