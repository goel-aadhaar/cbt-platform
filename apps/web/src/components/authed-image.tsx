"use client";

import { useEffect, useState, type ReactNode } from "react";

import { getToken } from "@/lib/auth";
import { mediaSrc } from "@/lib/media";

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
    let created: string | null = null;
    const token = getToken();
    fetch(
      resolved,
      token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    )
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
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
