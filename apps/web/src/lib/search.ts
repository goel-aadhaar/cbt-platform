import { apiFetch } from "./api";
import { getToken } from "./auth";

/** One console-search hit. Mirrors SearchHit on the server. */
export interface SearchHit {
  type: "student" | "exam" | "question";
  id: string;
  title: string;
  subtitle: string;
  /** Where the console should navigate for this hit. */
  href: string;
}

/**
 * GET /search — cross-entity console search (students, exams, questions).
 *
 * Tenant-scoped server-side, and additionally batch-scoped for teachers, so a
 * hit can never come back that the caller could not open.
 */
export function consoleSearch(
  term: string,
): Promise<{ term: string; hits: SearchHit[] }> {
  return apiFetch<{ term: string; hits: SearchHit[] }>(
    `/search?q=${encodeURIComponent(term)}`,
    { token: getToken() ?? undefined },
  );
}
