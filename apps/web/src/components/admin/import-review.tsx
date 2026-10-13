"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AuthedImage } from "@/components/authed-image";
import { RichText } from "@/components/rich-text";
import { StatusPill } from "@/components/staff/charts";
import { useAsyncAction, useKeyedAsyncAction } from "@/hooks/use-async-action";
import { useAdminData } from "@/hooks/use-admin-data";
import {
  bulkQuestionAction,
  getImportRun,
  listImportRunQuestions,
  sourceNumberText,
  type BulkQuestionActionName,
  type BulkQuestionResult,
  type ImportRunDetail,
  type QuestionStatus,
  type ReviewFlag,
  type ReviewQuestion,
} from "@/lib/questions";
import { mediaFileUrl } from "@/lib/media";

import { ZoomableImage } from "./image-lightbox";
import { AlertTriangleIcon, CheckCircleIcon, ChevronLeftIcon } from "./icons";
import { QuestionAuthorDrawer } from "./question-author-drawer";

type Role = "ADMIN" | "TEACHER";

const STATUS_LABEL: Record<QuestionStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Sent back",
  ARCHIVED: "Archived",
};

const STATUS_TONE: Record<QuestionStatus, "good" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted",
  REVIEW: "warn",
  APPROVED: "good",
  REJECTED: "bad",
  ARCHIVED: "muted",
};

const FLAG_TEXT: Record<ReviewFlag, string> = {
  formula: "Formula needs checking",
  answer: "Answer missing or invalid",
  label: "Numbered differently in the file",
};

/** Statuses an admin's "Approve" applies to (a draft is submitted on the way). */
const APPROVABLE: QuestionStatus[] = ["DRAFT", "REJECTED", "REVIEW"];
/** Statuses an author can send for approval. */
const SUBMITTABLE: QuestionStatus[] = ["DRAFT", "REJECTED"];

type Slot =
  | { kind: "question"; seq: number; question: ReviewQuestion }
  | {
      kind: "failed";
      seq: number;
      label: string | null;
      statement: string;
      reason: string;
    };

/**
 * Lay the run out in the order of the source file: every created question at
 * its own position, and every block that failed to import in the slot it
 * occupied — so a reviewer sees "Q4 — not imported" where Q4 should be rather
 * than a list that quietly jumps from Q3 to Q5.
 */
function buildSlots(run: ImportRunDetail, questions: ReviewQuestion[]): Slot[] {
  const slots: Slot[] = questions.map((q, i) => ({
    kind: "question" as const,
    seq: q.sourceSeq ?? i + 1,
    question: q,
  }));
  for (const f of run.failures) {
    if (typeof f.sourceSeq !== "number") continue;
    slots.push({
      kind: "failed",
      seq: f.sourceSeq,
      label: f.sourceLabel ?? null,
      statement: f.statement ?? "",
      reason: f.reason ?? "Failed",
    });
  }
  return slots.sort((a, b) => a.seq - b.seq);
}

function resultSummary(res: BulkQuestionResult, verb: string): string {
  const parts = [`${res.ok} question(s) ${verb}`];
  if (res.failed > 0) parts.push(`${res.failed} could not be changed`);
  return `${parts.join("; ")}.`;
}

/**
 * The post-upload review screen: every question one import created, in the
 * order of the source file, typeset, with what needs a second look flagged.
 * This is where the questions, answers, spellings and formulas get checked and
 * corrected before anything reaches the question bank.
 */
export function ImportReview({ role }: { role: Role }) {
  const runId = useSearchParams().get("run");
  const isAdmin = role === "ADMIN";
  const base = isAdmin ? "/admin/questions" : "/teacher/questions";

  const { data, loading, error, refreshing, reload } =
    useAdminData(async () => {
      if (!runId) return null;
      const [run, questions] = await Promise.all([
        getImportRun(runId),
        listImportRunQuestions(runId),
      ]);
      return { run, questions };
    }, [runId]);

  const [editing, setEditing] = useState<ReviewQuestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const slots = useMemo(
    () => (data ? buildSlots(data.run, data.questions) : []),
    [data],
  );

  const toApprove = questions.filter((q) => APPROVABLE.includes(q.status));
  const toSubmit = questions.filter((q) => SUBMITTABLE.includes(q.status));
  const blockedByFormula = toApprove.filter((q) =>
    q.flags?.includes("formula"),
  );
  const submitBlocked = toSubmit.filter((q) => q.flags?.includes("formula"));
  const counts = {
    draft: questions.filter((q) => q.status === "DRAFT").length,
    review: questions.filter((q) => q.status === "REVIEW").length,
    approved: questions.filter((q) => q.status === "APPROVED").length,
  };

  function report(res: BulkQuestionResult, verb: string) {
    setNotice(resultSummary(res, verb));
    const errors = res.results.filter((r) => !r.ok);
    if (errors.length > 0) {
      const byId = new Map(questions.map((q) => [q.id, q]));
      setActionError(
        errors
          .slice(0, 5)
          .map(
            (r) =>
              `${sourceNumberText(byId.get(r.id) ?? {}) ?? "Question"}: ${r.error ?? "failed"}`,
          )
          .join(" · "),
      );
    }
    reload();
  }

  const rowAction = useKeyedAsyncAction(
    async (key: string) => {
      const [id, action] = key.split("|") as [string, BulkQuestionActionName];
      const res = await bulkQuestionAction({ ids: [id], action });
      if (res.failed > 0) {
        throw new Error(res.results.find((r) => !r.ok)?.error ?? "Failed");
      }
      setNotice(
        action === "approve"
          ? "Approved."
          : action === "submit"
            ? "Sent for approval."
            : "Rejected.",
      );
      reload();
    },
    {
      onError: (_key, message) => setActionError(message),
      fallbackMessage: "Could not update the question",
    },
  );

  const bulk = useAsyncAction(
    async (action: BulkQuestionActionName) => {
      const res = await bulkQuestionAction({
        importRunId: runId ?? undefined,
        action,
      });
      report(res, action === "approve" ? "approved" : "sent for approval");
      setConfirmAll(false);
    },
    {
      onError: (message) => {
        setActionError(message);
        setConfirmAll(false);
      },
      fallbackMessage: "Could not update the questions",
    },
  );

  function startRow(q: ReviewQuestion, action: BulkQuestionActionName) {
    setActionError(null);
    setNotice(null);
    void rowAction.run(`${q.id}|${action}`);
  }

  const backLink = (
    <Link
      href={base}
      className="inline-flex items-center gap-1 text-sm font-semibold text-admin hover:underline"
    >
      <ChevronLeftIcon className="size-4" /> Back to the question bank
    </Link>
  );

  if (!runId) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
          Open this screen from an import — there is no upload selected.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl bg-admin-line/15"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error ?? "Could not load this import."}
        </p>
      </div>
    );
  }

  const { run } = data;
  const visible = attentionOnly
    ? slots.filter(
        (s) =>
          s.kind === "failed" ||
          (s.question.flags?.length ?? 0) > 0 ||
          s.question.status === "REJECTED",
      )
    : slots;

  return (
    <div className="flex flex-col gap-5">
      {backLink}

      <section className="rounded-2xl border border-admin-line/60 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-admin-ink">
              {run.fileName}
            </h2>
            <p className="mt-0.5 text-xs text-admin-muted">
              {run.target ? `${run.target} · ` : ""}
              {new Date(run.createdAt).toLocaleString("en-IN")}
              {run.createdBy ? ` · ${run.createdBy.name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill tone="good">{run.importedRows} imported</StatusPill>
            {run.failedRows > 0 && (
              <StatusPill tone="bad">{run.failedRows} not imported</StatusPill>
            )}
            <StatusPill tone="muted">{counts.draft} draft</StatusPill>
            <StatusPill tone="warn">{counts.review} in review</StatusPill>
            <StatusPill tone="good">{counts.approved} approved</StatusPill>
          </div>
        </div>

        {run.warnings.length > 0 && (
          <ul
            aria-label="Numbering warnings"
            className="mt-4 rounded-xl border border-warn/60 bg-warn/10 p-3 text-sm text-admin-ink"
          >
            {run.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-sm text-admin-muted">
          Questions are listed in the order of your file. Check the wording,
          spelling, options, answer and every formula; use <strong>Edit</strong>{" "}
          to correct anything, then{" "}
          {isAdmin
            ? "approve them into the question bank"
            : "send them for approval"}
          .
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              disabled={
                toApprove.length === 0 ||
                blockedByFormula.length > 0 ||
                bulk.pending
              }
              title={
                blockedByFormula.length > 0
                  ? `${blockedByFormula.length} question(s) still have a formula marked [[EQ …]]`
                  : undefined
              }
              className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve all ({toApprove.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setNotice(null);
                void bulk.run("submit");
              }}
              disabled={
                toSubmit.length === 0 ||
                submitBlocked.length > 0 ||
                bulk.pending
              }
              className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulk.pending
                ? "Sending…"
                : `Send all for approval (${toSubmit.length})`}
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-admin-ink">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(e) => setAttentionOnly(e.target.checked)}
              className="size-4 accent-admin"
            />
            Only show items that need attention
          </label>
          {refreshing && (
            <span className="text-xs text-admin-muted">Refreshing…</span>
          )}
        </div>
        {(isAdmin ? blockedByFormula : submitBlocked).length > 0 && (
          <p className="mt-2 text-xs font-semibold text-danger">
            {(isAdmin ? blockedByFormula : submitBlocked).length} question(s)
            still contain a Word equation marked [[EQ …]]. Edit each one and
            retype the formula as LaTeX between dollar signs, e.g.{" "}
            {"$x^2 + 3x = 0$"}, before{" "}
            {isAdmin ? "approving" : "sending for approval"}.
          </p>
        )}
      </section>

      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {actionError}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-admin/30 bg-admin/5 px-4 py-3 text-sm font-semibold text-admin"
        >
          {notice}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
          {attentionOnly
            ? "Nothing needs attention."
            : "This import did not create any questions."}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {visible.map((slot) =>
            slot.kind === "failed" ? (
              <li
                key={`failed-${slot.seq}`}
                className="rounded-2xl border border-danger/30 bg-danger-soft/20 p-5"
              >
                <p className="text-sm font-bold text-danger">
                  Q{slot.seq}
                  {slot.label && slot.label !== String(slot.seq)
                    ? ` (file: ${slot.label})`
                    : ""}{" "}
                  — not imported
                </p>
                {slot.statement && (
                  <p className="mt-1 text-sm text-admin-ink">
                    {slot.statement}
                  </p>
                )}
                <p className="mt-1 text-sm text-danger">{slot.reason}</p>
                <p className="mt-1 text-xs text-admin-muted">
                  Fix this question in your file and upload just it, or add it
                  by hand with Add Question.
                </p>
              </li>
            ) : (
              <ReviewCard
                key={slot.question.id}
                question={slot.question}
                isAdmin={isAdmin}
                busy={
                  rowAction.isPending(`${slot.question.id}|approve`) ||
                  rowAction.isPending(`${slot.question.id}|submit`) ||
                  rowAction.isPending(`${slot.question.id}|reject`)
                }
                onEdit={() => setEditing(slot.question)}
                onAction={(a) => startRow(slot.question, a)}
              />
            ),
          )}
        </ol>
      )}

      <QuestionAuthorDrawer
        key={editing?.id ?? "none"}
        open={editing !== null}
        editing={editing}
        closeOnSave
        onClose={() => setEditing(null)}
        onCreated={() => {
          setNotice("Changes saved.");
          reload();
        }}
      />

      {confirmAll && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Approve all questions"
          className="fixed inset-0 z-50 flex items-center justify-center p-6 [font-family:var(--font-hanken)]"
        >
          <button
            aria-label="Cancel"
            onClick={() => setConfirmAll(false)}
            className="absolute inset-0 bg-admin-ink/40"
          />
          <div className="relative w-full max-w-[460px] rounded-2xl bg-white p-7 shadow-2xl">
            <h2 className="text-lg font-bold text-admin-ink">
              Approve {toApprove.length} question(s)?
            </h2>
            <p className="mt-2 text-sm text-admin-muted">
              They will go into the question bank and become available to exams.
              Anything you have not read yet should be checked first — approved
              questions can still be edited, but exams that already use them are
              re-scored when an answer changes.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmAll(false)}
                disabled={bulk.pending}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void bulk.run("approve")}
                disabled={bulk.pending}
                className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                {bulk.pending ? "Approving…" : "Approve all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  question: q,
  isAdmin,
  busy,
  onEdit,
  onAction,
}: {
  question: ReviewQuestion;
  isAdmin: boolean;
  busy: boolean;
  onEdit: () => void;
  onAction: (action: BulkQuestionActionName) => void;
}) {
  const flags = q.flags ?? [];
  const formulaPending = flags.includes("formula");
  const canEdit = isAdmin
    ? q.status !== "ARCHIVED"
    : q.status === "DRAFT" || q.status === "REJECTED";
  const answerKeys = Array.isArray(q.answerKey)
    ? q.answerKey
    : [String(q.answerKey)];

  return (
    <li
      className={`rounded-2xl border bg-white p-5 ${
        flags.length > 0 ? "border-warn/60" : "border-admin-line/60"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-admin px-2.5 py-1 text-sm font-bold text-white">
          {sourceNumberText(q) ?? "Q"}
        </span>
        <StatusPill tone={STATUS_TONE[q.status]}>
          {STATUS_LABEL[q.status]}
        </StatusPill>
        <span className="text-xs text-admin-muted">
          {q.type} · {q.difficulty.toLowerCase()}
        </span>
        {flags.map((f) => (
          <span
            key={f}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              f === "answer"
                ? "bg-danger-soft text-danger"
                : "bg-[#fff4e0] text-[#8a5a00]"
            }`}
          >
            <AlertTriangleIcon className="size-3.5" /> {FLAG_TEXT[f]}
          </span>
        ))}
      </div>

      <RichText
        text={q.statement}
        className="mt-3 whitespace-pre-wrap text-admin-ink"
      />
      {q.mediaKeys.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {q.mediaKeys.map((key) => (
            <AuthedImage
              key={key}
              url={mediaFileUrl(key)}
              alt="Question diagram"
              className="max-h-48 max-w-full rounded border border-admin-line bg-white object-contain"
            />
          ))}
        </div>
      )}

      {q.type === "INTEGER" ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-admin-ink">
          <CheckCircleIcon className="size-4 text-admin" /> Answer:{" "}
          <span className="font-semibold">{String(q.answerKey)}</span>
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {(q.options ?? []).map((o) => {
            const correct = answerKeys.includes(o.key);
            return (
              <li
                key={o.key}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  correct
                    ? "border-admin/40 bg-admin-mint/15"
                    : "border-admin-line/60"
                }`}
              >
                <span className="font-bold text-admin-muted">{o.key}.</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {o.text.trim() && (
                    <RichText
                      text={o.text}
                      as="span"
                      className="text-admin-ink"
                    />
                  )}
                  {o.mediaKey && (
                    <ZoomableImage
                      mediaKey={o.mediaKey}
                      alt={`Option ${o.key} image`}
                      className="max-h-40"
                    />
                  )}
                </div>
                {correct && (
                  <span className="shrink-0 text-xs font-bold text-admin">
                    Correct
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {flags.includes("answer") && (
        <p className="mt-2 text-sm font-semibold text-danger">
          The answer key does not match the options — edit the question and
          choose the correct answer.
        </p>
      )}

      {q.explanation && (
        <div className="mt-3 border-t border-admin-line/60 pt-3">
          <p className="text-xs font-bold uppercase text-admin-muted">
            Explanation
          </p>
          <RichText
            text={q.explanation}
            className="mt-1 whitespace-pre-wrap text-sm text-admin-ink"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="rounded-lg border border-admin-line px-4 py-2 text-sm font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Edit
          </button>
        )}
        {isAdmin && q.status === "REVIEW" && (
          <button
            type="button"
            onClick={() => onAction("reject")}
            disabled={busy}
            className="rounded-lg border border-admin-line px-4 py-2 text-sm font-bold text-danger hover:bg-danger-soft/30 disabled:opacity-50"
          >
            Reject
          </button>
        )}
        {isAdmin && APPROVABLE.includes(q.status) && (
          <button
            type="button"
            onClick={() => onAction("approve")}
            disabled={busy || formulaPending}
            title={
              formulaPending
                ? "Retype the formula marked [[EQ …]] first (Edit)"
                : undefined
            }
            className="rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Approve
          </button>
        )}
        {!isAdmin && SUBMITTABLE.includes(q.status) && (
          <button
            type="button"
            onClick={() => onAction("submit")}
            disabled={busy || formulaPending}
            title={
              formulaPending
                ? "Retype the formula marked [[EQ …]] first (Edit)"
                : undefined
            }
            className="rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {q.status === "REJECTED"
              ? "Resubmit for approval"
              : "Send for approval"}
          </button>
        )}
      </div>
    </li>
  );
}
