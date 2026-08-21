"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useIsHydrated } from "./use-auth";

export interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** When the data in hand was last fetched — null until the first load. */
  refreshedAt: Date | null;
}

export interface AdminDataOptions {
  /**
   * Re-fetch on this interval, in milliseconds. Omit for a one-shot load.
   *
   * A refresh replaces the data in place: `loading` stays false and the old
   * rows stay on screen until the new ones arrive, so a screen someone is
   * reading does not blink to skeletons every few seconds. A failed refresh is
   * also swallowed rather than blanking good data — the timestamp going stale
   * is the signal.
   */
  refreshMs?: number;
}

/**
 * Loads a tenant-scoped admin resource once hydrated. Redirects to sign-in
 * when there's no token or the API returns 401. `deps` controls re-fetching
 * (e.g. a status filter); `loader` is read fresh each time deps change.
 */
export function useAdminData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: AdminDataOptions = {},
): LoadState<T> {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const [state, setState] = useState<LoadState<T>>({
    data: null,
    loading: true,
    error: null,
    refreshedAt: null,
  });
  const { refreshMs } = options;

  useEffect(() => {
    if (!hydrated) return;
    if (!getToken()) {
      router.replace("/login?as=staff");
      return;
    }
    let active = true;

    const run = (isRefresh: boolean) =>
      loader()
        .then((data) => {
          if (active)
            setState({
              data,
              loading: false,
              error: null,
              refreshedAt: new Date(),
            });
        })
        .catch((err) => {
          if (!active) return;
          // A dead session is announced centrally by apiFetch and explained by
          // SessionLostModal, which does the sign-out and the redirect. Racing
          // it with a silent bounce would replace that explanation with an
          // unexplained trip to the login screen.
          if (err instanceof ApiError && err.status === 401) return;
          // A failed *refresh* keeps the last good data on screen. During a
          // live exam, replacing a working roster with an error banner because
          // one poll timed out is worse than showing data that is a few
          // seconds old with a stale timestamp to prove it.
          if (isRefresh) return;
          setState({
            data: null,
            loading: false,
            error:
              err instanceof ApiError ? err.message : "Failed to load data",
            refreshedAt: null,
          });
        });

    void run(false);
    const timer = refreshMs
      ? setInterval(() => {
          void run(true);
        }, refreshMs)
      : null;

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
    // loader is intentionally excluded — `deps` drives re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, router, refreshMs, ...deps]);

  return state;
}
