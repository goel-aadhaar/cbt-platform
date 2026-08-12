"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchPracticeFacets,
  fetchPracticeQuestions,
  type PracticeFacets,
  type PracticeQuery,
  type PracticeQuestion,
} from "@/lib/practice";

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

/** GET /practice/facets — the subject/chapter/topic tree with counts. */
export function usePracticeFacets(): Async<PracticeFacets> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<PracticeFacets> | null>(null);

  const key = `facets#${nonce}`;

  useEffect(() => {
    let cancelled = false;
    fetchPracticeFacets()
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSettled({
            key,
            data: null,
            error: message(e, "Could not load practice library"),
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

/**
 * GET /practice/questions for a filter set. `enabled` defers the fetch until
 * the caller has resolved its filters (e.g. a slug → real subject name).
 */
export function usePracticeQuestions(
  query: PracticeQuery,
  enabled = true,
): Async<PracticeQuestion[]> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<PracticeQuestion[]> | null>(
    null,
  );

  // Serialised so a fresh object literal each render doesn't refetch forever.
  const key = `${JSON.stringify(query)}#${nonce}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPracticeQuestions(query)
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSettled({
            key,
            data: null,
            error: message(e, "Could not load questions"),
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // `query` is covered by `key`, which is its serialisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: settled?.data ?? null,
    error: settled?.error ?? null,
    loading: enabled && settled?.key !== key,
    reload,
  };
}
