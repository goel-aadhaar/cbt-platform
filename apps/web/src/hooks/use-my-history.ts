"use client";

import { useEffect, useState } from "react";

import { fetchMyHistory, type HistoryItem } from "@/lib/student";

/**
 * GET /me/history — the student's PUBLISHED results, newest first.
 *
 * `loading` starts true and is only ever cleared inside the promise callbacks,
 * so nothing calls setState in the effect body (React 19's
 * `react-hooks/set-state-in-effect`).
 */
export function useMyHistory(): {
  items: HistoryItem[];
  loading: boolean;
  error: string | null;
} {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyHistory()
      .then((data) => {
        if (cancelled) return;
        // Newest first, whatever order the API returned.
        setItems(
          [...data].sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
          ),
        );
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load your history",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}
