"use client";

import { useEffect, useState } from "react";

import { actOnQuestion, type QuestionAction } from "@/lib/admin";

import { AlertTriangleIcon, CheckCircleIcon, PlusIcon, XIcon } from "./icons";

interface Option {
  label: string;
  text: string;
  correct?: boolean;
  rationale?: string;
}

const OPTIONS: Option[] = [
  {
    label: "A",
    text: "Anaphase",
    correct: true,
    rationale:
      "Correct Rationale: This is the specific phase where cohesin proteins are cleaved, allowing kinetochore microtubules to pull sister chromatids apart.",
  },
  { label: "B", text: "Metaphase" },
  { label: "C", text: "Prophase" },
  { label: "D", text: "Telophase" },
];

const META = [
  "Sub: Cell Biology",
  "Ch: Mitosis",
  "Type: Multiple Choice",
  "Diff: Hard",
];

/**
 * Question review drawer (Figma 114:13872) — opened from the Question Bank list.
 * Presentational; Approve/Reject are stubs.
 */
import { MediaPicker } from "./media-picker";
import { getQuestion, setQuestionMedia } from "@/lib/questions";
import { ApiError } from "@/lib/api";

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

  /* Attached images (§2.7). Loaded lazily — only this drawer needs them. */
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
        if (!cancelled) setMediaKeys(q.mediaKeys ?? []);
      })
      .catch(() => {
        // Detail is a nice-to-have here; the actions below still work.
      });
    return () => {
      cancelled = true;
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

  async function act(action: QuestionAction) {
    if (!questionId) return;
    setPending(action);
    setActionError(null);
    try {
      const res = await actOnQuestion(questionId, action);
      onActioned?.(action, res.status);
      onClose();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : `Could not ${action} the question.`,
      );
    } finally {
      setPending(null);
    }
  }

  if (!open) return null;

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
                Question #BIO-4921
              </h2>
              <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-bold uppercase text-danger">
                Pending Review
              </span>
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
          {tab === 1 ? (
            <p className="py-10 text-center text-admin-muted">
              No recent activity on this question.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {questionId && (
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
              )}
              {/* Duplicate banner */}
              <div className="flex items-start gap-3 rounded-r-lg border-l-4 border-warn bg-admin-surface p-4">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warn" />
                <div className="flex-1">
                  <p className="font-bold text-admin-ink">
                    Possible Duplicate Detected
                  </p>
                  <p className="mt-0.5 text-sm text-admin-muted">
                    This question shares 85% textual similarity with #BIO-1102.
                    Please review before approving.
                  </p>
                </div>
                <button className="shrink-0 rounded-lg border border-admin-line bg-white px-3 py-1.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
                  Review Diff
                </button>
              </div>

              {/* Meta chips */}
              <div className="flex flex-wrap items-center gap-2">
                {META.map((m) => (
                  <span
                    key={m}
                    className="rounded-lg bg-admin-surface px-3 py-1.5 text-sm text-admin-muted"
                  >
                    {m}
                  </span>
                ))}
                <button className="flex size-8 items-center justify-center rounded-full border border-admin-line text-admin-muted hover:bg-admin-bg">
                  <PlusIcon className="size-4" />
                </button>
              </div>

              {/* Stem */}
              <section className="rounded-xl border border-admin-line/60 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
                    Question Stem
                  </p>
                  <button className="text-sm font-semibold text-admin-2">
                    ✎ Edit
                  </button>
                </div>
                <p className="mt-3 text-admin-ink">
                  During which phase of mitosis do the sister chromatids
                  separate and move towards opposite poles of the cell? Ensure
                  you consider the role of the kinetochore microtubules in your
                  reasoning.
                </p>
                <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-admin-line bg-admin-bg py-10 text-center">
                  <p className="text-sm font-semibold text-admin-muted">
                    The Stages of Mitosis: Cell Division
                  </p>
                  <p className="mt-2 text-xs text-admin-subtle">
                    Fig 1: Cellular Division Phase
                  </p>
                </div>
              </section>

              {/* Options */}
              <section>
                <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
                  Options
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {OPTIONS.map((o) => (
                    <div
                      key={o.label}
                      className={`flex items-start gap-3 rounded-xl border p-4 ${
                        o.correct
                          ? "border-admin/40 bg-admin-mint/15"
                          : "border-admin-line/60"
                      }`}
                    >
                      {o.correct ? (
                        <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-admin" />
                      ) : (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-admin-surface text-xs font-bold text-admin-muted">
                          {o.label}
                        </span>
                      )}
                      <div>
                        <p className="font-semibold text-admin-ink">{o.text}</p>
                        {o.rationale && (
                          <p className="mt-1 text-sm text-admin-muted">
                            {o.rationale}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-admin-line/60 px-8 py-5">
          <p
            className={`text-sm ${actionError ? "text-danger" : "text-admin-muted"}`}
            role={actionError ? "alert" : undefined}
          >
            {actionError ?? (questionId ? "" : "Open a question to review it.")}
          </p>
          <div className="flex items-center gap-3">
            <button
              disabled={!questionId || pending !== null}
              onClick={() => act("archive")}
              className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-muted hover:bg-admin-bg disabled:opacity-50"
            >
              {pending === "archive" ? "Archiving…" : "Archive"}
            </button>
            <button
              disabled={!questionId || pending !== null}
              onClick={() => act("reject")}
              className="rounded-lg border border-admin-line bg-white px-6 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft/30 disabled:opacity-50"
            >
              {pending === "reject" ? "Rejecting…" : "Reject"}
            </button>
            <button
              disabled={!questionId || pending !== null}
              onClick={() => act("approve")}
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
