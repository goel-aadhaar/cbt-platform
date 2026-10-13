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
  /** The chapter's unit, derived (a question stores no unit of its own). */
  chapterRef?: {
    unitId: string | null;
    unit: { id: string; name: string } | null;
  } | null;
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
  /** Position in the uploaded file (1-based); null for hand-authored ones. */
  sourceSeq?: number | null;
  /** The number the author wrote for it in the file ("10", "Q10"). */
  sourceLabel?: string | null;
  /** The upload that created it, for the review screen. */
  importRunId?: string | null;
}

/**
 * Question-bank filters. Mirrors the server's QueryQuestionsDto 1:1 — every
 * field is applied server-side, so the bank stays paginated (§2.4 targets
 * 20,000+ questions per institute; filtering client-side would not scale).
 */
export interface QuestionQuery {
  status?: QuestionStatus;
  subjectId?: string;
  /** A unit id, or `"unassigned"` for chapters that have no unit. */
  unitId?: string;
  chapterId?: string;
  /** Any of these chapters (max 50); combines with `chapterId` as an intersection. */
  chapterIds?: string[];
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
  /** Only what one upload created, in the order of the source file. */
  importRunId?: string;
  limit?: number;
  offset?: number;
}

/** The filter fields a picker UI can set (everything except paging/status). */
export type QuestionFilters = Pick<
  QuestionQuery,
  | "subjectId"
  | "unitId"
  | "chapterId"
  | "chapterIds"
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
  if (q.unitId) params.set("unitId", q.unitId);
  if (q.chapterId) params.set("chapterId", q.chapterId);
  if (q.chapterIds?.length) params.set("chapterIds", q.chapterIds.join(","));
  if (q.topicId) params.set("topicId", q.topicId);
  if (q.difficulty) params.set("difficulty", q.difficulty);
  if (q.type) params.set("type", q.type);
  if (q.examCategoryId) params.set("examCategoryId", q.examCategoryId);
  if (q.tag) params.set("tag", q.tag);
  if (q.mine) params.set("mine", "true");
  if (q.search) params.set("search", q.search);
  if (q.importRunId) params.set("importRunId", q.importRunId);
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

/**
 * One answer option. `text` may be empty when an image carries the option;
 * `mediaKey` is omitted (never null) when there is none.
 */
export interface QuestionOption {
  key: string;
  text: string;
  mediaKey?: string;
}

/** A single question with its full detail, including attached media keys. */
export interface QuestionDetail extends QuestionListItem {
  options: QuestionOption[] | null;
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
  options?: QuestionOption[];
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
  /** The upload to open on the review screen. */
  importRunId: string;
  imported: {
    index: number;
    id: string;
    type: string;
    statement: string;
    sourceSeq: number;
    sourceLabel: string | null;
  }[];
  failed: {
    index: number;
    statement: string;
    reason: string;
    sourceSeq: number;
    sourceLabel: string | null;
  }[];
  /** Numbering oddities in the file (jumps, duplicates, skipped items). */
  warnings: string[];
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

/** Things a reviewer should look at again before approving. */
export type ReviewFlag = "formula" | "answer" | "label";

/** A question as the review screen lists it: full content plus its flags. */
export type ReviewQuestion = QuestionDetail & { flags?: ReviewFlag[] };

/** Matches an equation that came in from Word and still needs retyping. */
export const FORMULA_PLACEHOLDER_RE = /\[\[EQ\b/;

/** True when any of these texts still carries a `[[EQ: …]]` placeholder. */
export function hasFormulaPlaceholder(
  ...texts: (string | null | undefined)[]
): boolean {
  return texts.some((t) => !!t && FORMULA_PLACEHOLDER_RE.test(t));
}

/** True when the author's own number disagrees with the question's position. */
export function labelDiffersFromPosition(q: {
  sourceSeq?: number | null;
  sourceLabel?: string | null;
}): boolean {
  const n = /\d+/.exec(q.sourceLabel ?? "");
  return !!q.sourceSeq && !!n && Number(n[0]) !== q.sourceSeq;
}

/** "Q10" for an imported question — its position, with the file's own label. */
export function sourceNumberText(q: {
  sourceSeq?: number | null;
  sourceLabel?: string | null;
}): string | null {
  if (!q.sourceSeq) return null;
  return labelDiffersFromPosition(q)
    ? `Q${q.sourceSeq} (file: ${q.sourceLabel})`
    : `Q${q.sourceSeq}`;
}

/** GET /imports/:id — one upload, with its failures and numbering warnings. */
export interface ImportRunDetail {
  id: string;
  kind: "STUDENTS_CSV" | "QUESTIONS_DOCX";
  fileName: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  failures: {
    index?: number;
    statement?: string;
    reason?: string;
    sourceSeq?: number;
    sourceLabel?: string | null;
  }[];
  target: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  warnings: string[];
}

export function getImportRun(id: string): Promise<ImportRunDetail> {
  return apiFetch<ImportRunDetail>(`/imports/${id}`, {
    token: getToken() ?? undefined,
  });
}

/**
 * Every question one upload created, in source order. The API caps a page at
 * 200 and an import at 500, so this walks the pages rather than assuming one.
 */
export async function listImportRunQuestions(
  importRunId: string,
): Promise<ReviewQuestion[]> {
  const out: ReviewQuestion[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await listQuestions({ importRunId, limit: 200, offset });
    out.push(...(page.items as ReviewQuestion[]));
    if (out.length >= page.total || page.items.length === 0) break;
  }
  return out;
}

export type BulkQuestionActionName = "submit" | "approve" | "reject";

export interface BulkQuestionResult {
  results: { id: string; ok: boolean; error?: string }[];
  ok: number;
  failed: number;
  /** Questions of the run left alone because the action did not apply. */
  skipped: number;
}

/**
 * POST /questions/bulk — send everything one upload created (`importRunId`) or
 * a list of questions (`ids`) through the review workflow. Teachers can only
 * `submit`. Each question gets its own result, so a partial failure is visible.
 */
export function bulkQuestionAction(input: {
  importRunId?: string;
  ids?: string[];
  action: BulkQuestionActionName;
  reason?: string;
}): Promise<BulkQuestionResult> {
  return apiFetch<BulkQuestionResult>(`/questions/bulk`, {
    method: "POST",
    body: input,
    token: getToken() ?? undefined,
  });
}
