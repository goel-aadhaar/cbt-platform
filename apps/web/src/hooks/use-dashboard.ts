"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

export interface DashboardSummary {
  counts: {
    students: number;
    activeStudents: number;
    questions: number;
    approvedQuestions: number;
    exams: number;
    liveExams: number;
    attemptsThisWeek: number;
    submittedThisWeek: number;
    pendingResults: number;
  };
  activity: { date: string; count: number }[];
  upcoming: {
    id: string;
    title: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    durationMinutes: number;
    questionCount: number;
    batchCount: number;
  }[];
  recentAttempts: {
    id: string;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    exam: { id: string; title: string };
    studentName: string;
    rollNumber: string;
    score: { totalScore: number; maxScore: number } | null;
  }[];
}

/**
 * GET /dashboard — every figure on the admin landing page in one round trip.
 * `loading` is cleared only inside the promise callbacks (React 19 forbids a
 * setState in the effect body).
 */
export function useDashboard(): {
  data: DashboardSummary | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DashboardSummary>("/dashboard", { token: getToken() ?? undefined })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load the dashboard",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
