"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchMyAttempts, type MyAttempt } from "@/lib/student";

/**
 * GET /me/attempts — the student's own attempts and the state of each result
 * (in progress / pending / published), newest first.
 *
 * `loading` is only ever cleared inside the promise callbacks so nothing calls
 * setState in the effect body (React 19's `react-hooks/set-state-in-effect`).
 */
export function useMyAttempts(): {
  items: MyAttempt[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [items, setItems] = useState<MyAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMyAttempts()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load your attempts",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { items, loading, error, refresh };
}
