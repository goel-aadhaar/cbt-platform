"use client";

import { useEffect, useState } from "react";

import { actOnQuestion, type QuestionAction } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import {
  getQuestion,
  setQuestionMedia,
  type QuestionDetail,
} from "@/lib/questions";

import { PlusIcon, XIcon } from "./icons";
import { MediaPicker } from "./media-picker";
import { QuestionPreview } from "./question-preview";

const STATUS_LABEL: Record<QuestionDetail["status"], string> = {
  DRAFT: "Draft",
  REVIEW: "Pending Review",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

const STATUS_TONE: Record<QuestionDetail["status"], string> = {
  DRAFT: "bg-admin-surface text-admin-muted",
  REVIEW: "bg-danger-soft text-danger",
  APPROVED: "bg-admin-mint/50 text-admin",
  ARCHIVED: "bg-admin-surface text-admin-muted",
};

/**
 * Question review drawer (Figma 114:13872) — opened from the Question Bank
 * list, by both the teacher and admin consoles. Shows the actual question
 * fetched by id; Approve/Reject/Archive act on that same question.
 */
export function QuestionDetailDrawer({
  open,
  onClose,
  questionId,
  onActioned,
}: {
  open: boolean;
  onClose: () => void;
  /** Question under review; enables the Approve/Reject/Archive actions. */
  questionId?: string;
  /** Called after a successful transition so the list can refresh. */
  onActioned?: (action: QuestionAction, status: string) => void;
}) {
  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState<QuestionAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Set when archiving 409s because the question is already used in exams. */
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Derived, not its own state — every setter below only ever runs inside a
  // promise callback or the effect's cleanup, never synchronously in the
  // effect body itself.
  const loading = Boolean(open && questionId && !loadError && !question);

  /* Attached images (§2.7). */
  const [mediaKeys, setMediaKeys] = useState<string[]>([]);
  const [mediaSaving, setMediaSaving] = useState(false);
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  /** Set when the server asks us to confirm editing a question used in exams. */
  const [confirmKeys, setConfirmKeys] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open || !questionId) return;
    let cancelled = false;
    getQuestion(questionId)
      .then((q) => {
        if (cancelled) return;
        setQuestion(q);
        setMediaKeys(q.mediaKeys ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load this question.",
          );
        }
      });
    // Runs before the next fetch (questionId changed) and on close/unmount —
    // clears the previous question's state so a stale one never flashes
    // under a newly-opened id, without setting state synchronously in the
    // effect body itself.
    return () => {
      cancelled = true;
      setQuestion(null);
      setMediaKeys([]);
      setLoadError(null);
      setArchiveConfirm(false);
    };
  }, [open, questionId]);

  async function saveMedia(keys: string[], confirm = false) {
    if (!questionId) return;
    const previous = mediaKeys;
    setMediaKeys(keys); // optimistic — the grid should feel instant
    setMediaSaving(true);
    setMediaNote(null);
    try {
      await setQuestionMedia(questionId, keys, confirm);
      setConfirmKeys(null);
      setMediaNote(
        keys.length === 0
          ? "Images removed."
          : `${keys.length} image${keys.length === 1 ? "" : "s"} attached.`,
      );
    } catch (e: unknown) {
      setMediaKeys(previous); // roll back so the UI never lies about what saved
      // The server guards edits to questions already used in exams; ask rather
      // than silently overriding it.
      if (e instanceof ApiError && e.status === 409) {
        setConfirmKeys(keys);
        setMediaNote(e.message);
      } else {
        setMediaNote(
          e instanceof Error
            ? e.message
            : "Could not save the attached images.",
        );
      }
    } finally {
      setMediaSaving(false);
    }
  }

  async function act(action: QuestionAction, confirm = false) {
    if (!questionId) return;
    setPending(action);
    setActionError(null);
    try {
      const res = await actOnQuestion(questionId, action, confirm);
      setArchiveConfirm(false);
      onActioned?.(action, res.status);
      onClose();
    } catch (err) {
      // Same in-use safeguard as media/edit: archiving a question already
      // used in an exam asks for confirmation instead of silently archiving.
      if (
        action === "archive" &&
        err instanceof ApiError &&
        err.status === 409
      ) {
        setArchiveConfirm(true);
        setActionError(err.message);
      } else {
        setActionError(
          err instanceof Error
            ? err.message
            : `Could not ${action} the question.`,
        );
      }
    } finally {
      setPending(null);
    }
  }

  if (!open) return null;

  const canApproveReject = question?.status === "REVIEW";
  const canArchive = question?.status !== "ARCHIVED";

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />

      <div className="relative flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <header className="border-b border-admin-line/60 px-8 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-admin-ink">
                {question
                  ? `${question.subject} — ${question.chapter}`
                  : loading
                    ? "Loading…"
                    : "Question"}
              </h2>
              {question && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_TONE[question.status]}`}
                >
                  {STATUS_LABEL[question.status]}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <div className="mt-4 flex gap-6">
            {["Details", "Activity"].map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`border-b-2 pb-3 text-sm font-bold uppercase tracking-wide ${
                  i === tab
                    ? "border-admin text-admin"
                    : "border-transparent text-admin-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-auto px-8 py-6">
          {loadError ? (
            <p role="alert" className="py-10 text-center text-danger">
              {loadError}
            </p>
          ) : loading ? (
            <p className="py-10 text-center text-admin-muted">Loading…</p>
          ) : !question ? (
            <p className="py-10 text-center text-admin-muted">
              Open a question to review it.
            </p>
          ) : tab === 1 ? (
            <p className="py-10 text-center text-admin-muted">
              Activity history is not tracked for questions yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              <section className="rounded-xl border border-admin-line/60 p-4">
                <MediaPicker
                  selected={mediaKeys}
                  onChange={(keys) => void saveMedia(keys)}
                  disabled={mediaSaving}
                />
                {mediaNote && (
                  <p className="mt-2 text-xs font-semibold text-admin-muted">
                    {mediaSaving ? "Saving…" : mediaNote}
                  </p>
                )}
                {confirmKeys && !mediaSaving && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveMedia(confirmKeys, true)}
                      className="rounded-lg bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95"
                    >
                      Attach anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmKeys(null);
                        setMediaNote(null);
                      }}
                      className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold uppercase text-admin-ink hover:bg-admin-bg"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </section>

              {question.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {question.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-admin-mint/40 px-3 py-1 text-xs font-semibold text-admin"
                    >
                      <PlusIcon className="size-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <QuestionPreview question={question} />
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-admin-line/60 px-8 py-5">
          <p
            className={`text-sm ${actionError ? "text-danger" : "text-admin-muted"}`}
            role={actionError ? "alert" : undefined}
          >
            {actionError ?? (question ? "" : "Open a question to review it.")}
          </p>
          <div className="flex items-center gap-3">
            {archiveConfirm ? (
              <>
                <button
                  disabled={pending !== null}
                  onClick={() => void act("archive", true)}
                  className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                >
                  {pending === "archive" ? "Archiving…" : "Archive anyway"}
                </button>
                <button
                  disabled={pending !== null}
                  onClick={() => {
                    setArchiveConfirm(false);
                    setActionError(null);
                  }}
                  className="rounded-lg border border-admin-line px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                disabled={!question || !canArchive || pending !== null}
                onClick={() => void act("archive")}
                className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-muted hover:bg-admin-bg disabled:opacity-50"
              >
                {pending === "archive" ? "Archiving…" : "Archive"}
              </button>
            )}
            <button
              disabled={!question || !canApproveReject || pending !== null}
              onClick={() => void act("reject")}
              className="rounded-lg border border-admin-line bg-white px-6 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft/30 disabled:opacity-50"
            >
              {pending === "reject" ? "Rejecting…" : "Reject"}
            </button>
            <button
              disabled={!question || !canApproveReject || pending !== null}
              onClick={() => void act("approve")}
              className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            >
              {pending === "approve" ? "Approving…" : "Approve Question"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
