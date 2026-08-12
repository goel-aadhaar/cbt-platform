"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { fetchAvailableExams, type AvailableExam } from "@/lib/student";

/**
 * Loads the student's available (live, in-window, assigned) exams. Backs the
 * Home + Mock Tests CTAs so they can build a "Start" → /exam link without
 * hard-coding an exam id (the seed wipes + re-ids the demo tenant).
 *
 * `loading` is `true` until the first fetch settles; on refresh we keep the
 * last items visible until the next resolve (no flicker, no setState in
 * effect body).
 */
export function useAvailableExams(): {
  items: AvailableExam[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [items, setItems] = useState<AvailableExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAvailableExams()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? err.status === 401
              ? "Not authenticated."
              : err.message
            : "Couldn't load available exams.";
        setError(msg);
        setItems([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    items,
    loading,
    error,
    refresh: () => setTick((n) => n + 1),
  };
}
