"use client";

import { useEffect, useState } from "react";

import {
  fetchExamSchedule,
  type AvailableExam,
  type UpcomingExam,
} from "@/lib/student";

/**
 * GET /attempts/available — what the student can sit right now, plus what is
 * scheduled next. `loading` is only cleared inside the promise callbacks so
 * nothing calls setState in the effect body (React 19).
 */
export function useExamSchedule(): {
  live: AvailableExam[];
  upcoming: UpcomingExam[];
  loading: boolean;
  error: string | null;
} {
  const [live, setLive] = useState<AvailableExam[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExamSchedule()
      .then(({ items, upcoming: next }) => {
        if (cancelled) return;
        setLive(items);
        setUpcoming(next);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load your schedule",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { live, upcoming, loading, error };
}
