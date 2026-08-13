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
}

/**
 * Loads a tenant-scoped admin resource once hydrated. Redirects to sign-in
 * when there's no token or the API returns 401. `deps` controls re-fetching
 * (e.g. a status filter); `loader` is read fresh each time deps change.
 */
export function useAdminData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): LoadState<T> {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const [state, setState] = useState<LoadState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!hydrated) return;
    if (!getToken()) {
      router.replace("/login?as=staff");
      return;
    }
    let active = true;
    loader()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!active) return;
        // A dead session is announced centrally by apiFetch and explained by
        // SessionLostModal, which does the sign-out and the redirect. Racing
        // it with a silent bounce would replace that explanation with an
        // unexplained trip to the login screen.
        if (err instanceof ApiError && err.status === 401) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof ApiError ? err.message : "Failed to load data",
        });
      });
    return () => {
      active = false;
    };
    // loader is intentionally excluded — `deps` drives re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, router, ...deps]);

  return state;
}
