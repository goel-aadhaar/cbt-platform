import { ApiError, apiFetch } from "./api";
import { getToken } from "./auth";
import type { Paginated } from "./students";

export type QuestionStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  /** Sent back by an admin; editable and re-submittable exactly like a draft. */
  | "REJECTED"
  | "ARCHIVED";
export type QuestionType = "MCQ" | "MSQ" | "INTEGER";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface QuestionListItem {
  id: string;
  subject: string;
  chapter: string;
  topic: string | null;
  subjectId: string;
  chapterId: string;
  topicId: string | null;
  difficulty: Difficulty;
  type: QuestionType;
  examCategoryId: string | null;
  examCategory: { id: string; name: string } | null;
  tags: string[];
  marks: number;
  negativeMarks: number;
  status: QuestionStatus;
  isActive: boolean;
  statement: string;
  createdAt: string;
  /** Author, so a teacher can pick their own work out of the bank. */
  createdBy: { id: string; name: string } | null;
}

/**
 * Question-bank filters. Mirrors the server's QueryQuestionsDto 1:1 — every
 * field is applied server-side, so the bank stays paginated (§2.4 targets
 * 20,000+ questions per institute; filtering client-side would not scale).
 */
export interface QuestionQuery {
  status?: QuestionStatus;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  examCategoryId?: string;
  /** Single tag to match (the API matches one tag at a time). */
  tag?: string;
  /** Only questions the signed-in user wrote. */
  mine?: boolean;
  /** Free-text, served by the Postgres full-text search port. */
  search?: string;
  limit?: number;
  offset?: number;
}

/** The filter fields a picker UI can set (everything except paging/status). */
export type QuestionFilters = Pick<
  QuestionQuery,
  | "subjectId"
  | "chapterId"
  | "topicId"
  | "difficulty"
  | "type"
  | "examCategoryId"
  | "tag"
  | "search"
  | "mine"
>;

/**
 * Status tallies over the WHOLE filtered set (minus the status filter itself),
 * not just the returned page — mirrors StudentRoster's `counts`. Needed once
 * the bank is paginated at a real page size instead of "200 and hope that
 * covers it": tab badges computed from one loaded page would be wrong the
 * moment a filter's results exceed one page.
 */
export interface QuestionRoster extends Paginated<QuestionListItem> {
  counts?: {
    all: number;
    draft: number;
    review: number;
    approved: number;
    rejected: number;
    archived: number;
  };
}

/**
 * GET /questions — teacher/admin, tenant-scoped.
 *
 * Some earlier deployments returned a BARE ARRAY rather than an
 * `{items,total}` envelope; the array branch below is a defensive fallback
 * for that, not the shape the current API actually sends.
 */
export async function listQuestions(
  q: QuestionQuery = {},
): Promise<QuestionRoster> {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.subjectId) params.set("subjectId", q.subjectId);
  if (q.chapterId) params.set("chapterId", q.chapterId);
  if (q.topicId) params.set("topicId", q.topicId);
  if (q.difficulty) params.set("difficulty", q.difficulty);
  if (q.type) params.set("type", q.type);
  if (q.examCategoryId) params.set("examCategoryId", q.examCategoryId);
  if (q.tag) params.set("tag", q.tag);
  if (q.mine) params.set("mine", "true");
  if (q.search) params.set("search", q.search);
  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const res = await apiFetch<QuestionListItem[] | QuestionRoster>(
    `/questions?${params}`,
    { token: getToken() ?? undefined },
  );
  // Tolerate both shapes so a future envelope change doesn't break the console.
  if (Array.isArray(res)) {
    return { items: res, total: res.length, limit, offset };
  }
  return res;
}

/** A single question with its full detail, including attached media keys. */
export interface QuestionDetail extends QuestionListItem {
  options: { key: string; text: string }[] | null;
  answerKey: string | number | string[];
  explanation: string | null;
  /** Storage keys (§2.7) — resolve to URLs via the media library. */
  mediaKeys: string[];
}

/** GET /questions/:id */
export function getQuestion(id: string): Promise<QuestionDetail> {
  return apiFetch<QuestionDetail>(`/questions/${id}`, {
    token: getToken() ?? undefined,
  });
}

/** Body for POST /questions — mirrors the server's CreateQuestionDto 1:1. */
export interface CreateQuestionInput {
  subjectId: string;
  chapterId: string;
  topicId?: string;
  difficulty: Difficulty;
  type: QuestionType;
  examCategoryId?: string;
  tags?: string[];
  statement: string;
  /** Required for MCQ/MSQ (2+ options); omitted for INTEGER. */
  options?: { key: string; text: string }[];
  /** MCQ: one option key. MSQ: option keys. INTEGER: a number. */
  answerKey: string | number | string[];
  explanation?: string;
  marks?: number;
  negativeMarks?: number;
  mediaKeys?: string[];
}

/** POST /questions — author a single question as DRAFT. */
export function createQuestion(
  input: CreateQuestionInput,
): Promise<QuestionDetail> {
  return apiFetch<QuestionDetail>(`/questions`, {
    method: "POST",
    body: input,
    token: getToken() ?? undefined,
  });
}

/**
 * Everything an edit may change. All optional — absent means "leave alone",
 * matching the server's partial-update contract.
 */
export type UpdateQuestionInput = Partial<CreateQuestionInput> & {
  /**
   * Acknowledge that the question has already been used in an exam.
   *
   * Without it the API answers 409 `QuestionUsedInExams` and lists the exams
   * affected — a deliberate safeguard, because an answer-key change re-scores
   * concluded papers. The UI shows that list and asks before re-sending with
   * this set.
   */
  confirm?: boolean;
};

/** One exam named by a `QuestionUsedInExams` refusal. */
export interface AffectedExam {
  id: string;
  title: string;
  status: string;
}

/**
 * PATCH /questions/:id.
 *
 * Returns the updated question plus `recalculated` — the exams the edit
 * re-scored, which is empty unless the answer key, type or options actually
 * changed.
 */
export function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
): Promise<
  QuestionDetail & { recalculated?: { examId: string; evaluated: number }[] }
> {
  return apiFetch(`/questions/${id}`, {
    method: "PATCH",
    body: input,
    token: getToken() ?? undefined,
  });
}

/**
 * Pull the affected-exam list out of a `QuestionUsedInExams` refusal, or null
 * if this was some other error.
 */
export function usedInExams(err: unknown): AffectedExam[] | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  if (err.reason !== "QuestionUsedInExams") return null;
  const body = err.body as { affectedExams?: AffectedExam[] } | undefined;
  return body?.affectedExams ?? [];
}

/** GET /questions/import/template — the workbook to fill in. */
export async function downloadQuestionTemplate(): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const res = await fetch(`${base}/questions/import/template`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok)
    throw new Error(`Could not download the template (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "codonmind-questions-template.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Defaults applied to a row that omits the field, mirrors the server's DocxDefaults. */
export interface QuestionImportDefaults {
  subjectId?: string;
  chapterId?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  examCategoryId?: string;
}

export interface QuestionImportSummary {
  total: number;
  imported: { index: number; id: string; type: string; statement: string }[];
  failed: { index: number; statement: string; reason: string }[];
}

/**
 * POST /questions/import — multipart upload of a .docx question set. Sent
 * with fetch directly (not apiFetch) because the body is FormData: setting
 * Content-Type manually would strip the multipart boundary.
 */
export async function importQuestionsFile(
  file: File,
  defaults: QuestionImportDefaults = {},
): Promise<QuestionImportSummary> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const qs = new URLSearchParams();
  if (defaults.subjectId) qs.set("subjectId", defaults.subjectId);
  if (defaults.chapterId) qs.set("chapterId", defaults.chapterId);
  if (defaults.difficulty) qs.set("difficulty", defaults.difficulty);
  if (defaults.type) qs.set("type", defaults.type);
  if (defaults.examCategoryId)
    qs.set("examCategoryId", defaults.examCategoryId);

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${base}/questions/import?${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    body: form,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload?.message;
    throw new Error(
      Array.isArray(msg)
        ? msg.join(", ")
        : (msg ?? `Import failed (${res.status})`),
    );
  }
  return payload as QuestionImportSummary;
}

export type ExportFormat = "PDF" | "DOCX";

/** Body for POST /questions/export. Either `ids` or `filters` — see the
 * function doc below for which one wins when both are present. */
export interface ExportQuestionsInput {
  /** Exactly these questions, in this order — used for a manual tick-list. */
  ids?: string[];
  /** Every question matching these filters — used for "select all filtered". */
  filters?: QuestionFilters & { status?: QuestionStatus };
  format: ExportFormat;
  /** false = "Questions Only" — the correct answer is never included. */
  includeAnswers: boolean;
}

/**
 * POST /questions/export — a real PDF or DOCX of the selected questions.
 *
 * `ids` takes priority when both are sent: a manual tick-list is always more
 * specific than "whatever the filters currently match". Streams the file the
 * same way every other export in the console does — fetch + blob + a
 * throwaway <a>, because an <a href> cannot carry the bearer token this
 * route needs.
 */
export async function exportQuestions(
  input: ExportQuestionsInput,
): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  const res = await fetch(`${base}/questions/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message;
    throw new Error(
      Array.isArray(msg)
        ? msg.join(", ")
        : (msg ?? `Export failed (${res.status})`),
    );
  }
  // The server names the file (subject/date/answers-or-not); read it back
  // from the header it sends rather than guessing one here.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `questions.${input.format.toLowerCase()}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * PATCH /questions/:id — replace the attached media.
 *
 * Questions reference media by key, so re-pointing the bucket or adding a CDN
 * never invalidates what a question shows.
 */
export function setQuestionMedia(
  id: string,
  mediaKeys: string[],
  /**
   * Required when the question already appears in an exam. The server refuses
   * with 409 QuestionUsedInExams otherwise, so a past paper can never change
   * under a candidate without someone acknowledging it.
   */
  confirm = false,
): Promise<QuestionDetail> {
  return apiFetch<QuestionDetail>(`/questions/${id}`, {
    method: "PATCH",
    body: confirm ? { mediaKeys, confirm: true } : { mediaKeys },
    token: getToken() ?? undefined,
  });
}
