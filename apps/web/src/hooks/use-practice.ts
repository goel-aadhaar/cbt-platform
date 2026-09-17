"use client";

import { useCallback, useEffect, useState } from "react";

import { listMyDpps, type MyDpp } from "@/lib/dpp";

interface Async<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Result of the most recent settled request, tagged with the request key that
 * produced it. `loading` is DERIVED by comparing that tag against the key we
 * currently want — setting a loading flag inside the effect body would trip
 * React 19's `react-hooks/set-state-in-effect`.
 */
interface Settled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

function message(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/** GET /me/dpps — DPPs assigned to the calling student's own batch. */
export function useMyDpps(): Async<MyDpp[]> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<MyDpp[]> | null>(null);

  const key = `dpps#${nonce}`;

  useEffect(() => {
    let cancelled = false;
    listMyDpps()
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSettled({
            key,
            data: null,
            error: message(e, "Could not load your DPPs"),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: settled?.data ?? null,
    error: settled?.error ?? null,
    loading: settled?.key !== key,
    reload,
  };
}
