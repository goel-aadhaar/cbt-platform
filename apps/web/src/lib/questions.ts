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
}

export interface QuestionQuery {
  status?: QuestionStatus;
  subject?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** GET /questions — teacher/admin, tenant-scoped, paginated. */
export function listQuestions(
  q: QuestionQuery = {},
): Promise<Paginated<QuestionListItem>> {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.subject) params.set("subject", q.subject);
  if (q.search) params.set("search", q.search);
  params.set("limit", String(q.limit ?? 50));
  params.set("offset", String(q.offset ?? 0));
  return apiFetch<Paginated<QuestionListItem>>(`/questions?${params}`, {
    token: getToken() ?? undefined,
  });
}
