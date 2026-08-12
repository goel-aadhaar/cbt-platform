import { apiFetch } from "./api";
import { getToken } from "./auth";
import type { Paginated } from "./students";

export type QuestionStatus = "DRAFT" | "REVIEW" | "APPROVED" | "ARCHIVED";
export type QuestionType = "MCQ" | "MSQ" | "INTEGER";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface QuestionListItem {
  id: string;
  subject: string;
  chapter: string;
  topic: string | null;
  difficulty: Difficulty;
  type: QuestionType;
  examType: string;
  tags: string[];
  marks: number;
  negativeMarks: number;
  status: QuestionStatus;
  isActive: boolean;
  statement: string;
  createdAt: string;
  /** Curated into the student practice library by a teacher (§2.4). */
  inPracticeLibrary: boolean;
  practiceAddedAt: string | null;
}

/**
 * Question-bank filters. Mirrors the server's QueryQuestionsDto 1:1 — every
 * field is applied server-side, so the bank stays paginated (§2.4 targets
 * 20,000+ questions per institute; filtering client-side would not scale).
 */
export interface QuestionQuery {
  status?: QuestionStatus;
  subject?: string;
  chapter?: string;
  topic?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  examType?: string;
  /** Single tag to match (the API matches one tag at a time). */
  tag?: string;
  /** Only questions curated into the practice library (or only those not). */
  inPracticeLibrary?: boolean;
  /** Free-text, served by the Postgres full-text search port. */
  search?: string;
  limit?: number;
  offset?: number;
}

/** The filter fields a picker UI can set (everything except paging/status). */
export type QuestionFilters = Pick<
  QuestionQuery,
  | "subject"
  | "chapter"
  | "topic"
  | "difficulty"
  | "type"
  | "examType"
  | "tag"
  | "search"
  | "inPracticeLibrary"
>;

/**
 * GET /questions — teacher/admin, tenant-scoped.
 *
 * NOTE: the endpoint returns a BARE ARRAY (verified against the live API), not
 * an `{items,total}` envelope like /students. We normalise it into `Paginated`
 * here so callers keep one shape; `total` is the number of rows returned, so
 * pass a `limit` high enough to cover the bank if you rely on it for counts.
 */
export async function listQuestions(
  q: QuestionQuery = {},
): Promise<Paginated<QuestionListItem>> {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.subject) params.set("subject", q.subject);
  if (q.chapter) params.set("chapter", q.chapter);
  if (q.topic) params.set("topic", q.topic);
  if (q.difficulty) params.set("difficulty", q.difficulty);
  if (q.type) params.set("type", q.type);
  if (q.examType) params.set("examType", q.examType);
  if (q.tag) params.set("tag", q.tag);
  if (q.inPracticeLibrary !== undefined)
    params.set("inPracticeLibrary", String(q.inPracticeLibrary));
  if (q.search) params.set("search", q.search);
  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const res = await apiFetch<QuestionListItem[] | Paginated<QuestionListItem>>(
    `/questions?${params}`,
    { token: getToken() ?? undefined },
  );
  // Tolerate both shapes so a future envelope change doesn't break the console.
  if (Array.isArray(res)) {
    return { items: res, total: res.length, limit, offset };
  }
  return res;
}
