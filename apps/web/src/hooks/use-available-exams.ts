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
 *
 * `kind` defaults to MOCK_TEST (§ Assessments) — the existing Mock Test
 * callers don't pass it; "My Assessments" passes ASSESSMENT.
 */
export function useAvailableExams(kind?: "MOCK_TEST" | "ASSESSMENT"): {
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
    fetchAvailableExams(kind)
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 401 is handled by SessionLostModal, which names the actual reason;
        // "Not authenticated." underneath it would only add noise.
        if (err instanceof ApiError && err.status === 401) {
          setItems([]);
          setLoading(false);
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Couldn't load available exams.";
        setError(msg);
        setItems([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick, kind]);

  return {
    items,
    loading,
    error,
    refresh: () => setTick((n) => n + 1),
  };
}
