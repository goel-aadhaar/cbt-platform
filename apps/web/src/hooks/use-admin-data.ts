"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useIsHydrated } from "./use-auth";

export interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** When the data in hand was last fetched — null until the first load. */
  refreshedAt: Date | null;
  /**
   * A query is running while previous results are still on screen — a changed
   * filter, a typed search, a poll.
   *
   * Distinct from `loading`, which means "there is nothing to show yet".
   * Without this a screen re-queries in complete silence: the old rows sit
   * there looking current, and someone who has just typed into a search box
   * has no way to tell whether anything is happening.
   */
  refreshing: boolean;
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
 *
 * The returned `reload()` re-runs the loader on demand. It exists so a screen
 * that has just written something can refresh its data WITHOUT
 * `window.location.reload()`: a full reload tears down every open drawer and
 * modal, which throws the operator out of whatever they were in the middle of
 * — on the results screen it ejected an admin from the answer-key panel the
 * moment a correction landed.
 */
export function useAdminData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: AdminDataOptions = {},
): LoadState<T> & { reload: () => void } {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const [state, setState] = useState<LoadState<T>>({
    data: null,
    loading: true,
    error: null,
    refreshedAt: null,
    refreshing: false,
  });
  const { refreshMs } = options;
  /** Bumped by reload() to re-trigger the effect below. */
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!hydrated) return;
    if (!getToken()) {
      router.replace("/login?as=staff");
      return;
    }
    let active = true;

    const run = (isRefresh: boolean) => {
      // Announce the query while the old rows stay put. Only meaningful once
      // there is something on screen — before that, `loading` already says it.
      setState((prev) =>
        prev.data === null ? prev : { ...prev, refreshing: true },
      );
      return loader()
        .then((data) => {
          if (active)
            setState({
              data,
              loading: false,
              error: null,
              refreshedAt: new Date(),
              refreshing: false,
            });
        })
        .catch((err) => {
          if (!active) return;
          // Clear the indicator on every failure path below, or a screen that
          // errors once keeps claiming it is still fetching.
          setState((prev) => ({ ...prev, refreshing: false }));
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
            refreshing: false,
          });
        });
    };

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
  }, [hydrated, router, refreshMs, nonce, ...deps]);

  return { ...state, reload };
}
