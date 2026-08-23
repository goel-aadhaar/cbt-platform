"use client";

import { useEffect, useMemo, useState } from "react";

import { XIcon } from "@/components/admin/icons";
import {
  getManualRoster,
  setManualScores,
  type ManualRoster,
  type ManualRosterItem,
} from "@/lib/admin";
import { formatAnswer } from "@/lib/student";

/**
 * Manual evaluation of one question (§2.5).
 *
 * Setting a question to MANUAL removes it from auto-scoring, so until marks are
 * awarded here every candidate scores zero on it. This is the other half of
 * that switch: each candidate's submitted answer next to a marks box.
 *
 * Awards are collected locally and written in ONE request. That is not just a
 * round-trip saving — the server re-ranks the whole cohort after each write, so
 * saving per row would move every candidate's rank once per candidate, and a
 * grader who stopped halfway would leave the exam in a state no one intended.
 */
export function ManualGradingDrawer({
  examId,
  questionId,
  questionNumber,
  onClose,
  onGraded,
}: {
  examId: string;
  questionId: string;
  /** 1-based, as candidates see it. */
  questionNumber: number;
  onClose: () => void;
  /** Fired after a successful save so the caller can refresh its rows. */
  onGraded?: (message: string) => void;
}) {
  const [roster, setRoster] = useState<ManualRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** attemptId → what the grader has typed. Empty string means "leave alone". */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [onlyUngraded, setOnlyUngraded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getManualRoster(examId, questionId)
      .then((r) => {
        if (cancelled) return;
        setRoster(r);
        // Seed with what is already awarded, so an edit pass shows the current
        // marks rather than blank boxes that look ungraded.
        setDraft(
          Object.fromEntries(
            r.items.map((i) => [
              i.attemptId,
              i.awarded === null ? "" : String(i.awarded),
            ]),
          ),
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load the grading list.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [examId, questionId]);

  const max = roster?.maxMarks ?? 0;

  /** Rows whose value differs from what the server already holds. */
  const changed = useMemo(() => {
    if (!roster) return [];
    return roster.items.flatMap((i) => {
      const raw = draft[i.attemptId];
      if (raw === undefined || raw.trim() === "") return [];
      const marks = Number(raw);
      if (!Number.isFinite(marks)) return [];
      if (i.awarded !== null && i.awarded === marks) return [];
      return [{ attemptId: i.attemptId, marks }];
    });
  }, [roster, draft]);

  const invalid = useMemo(() => {
    return Object.entries(draft).filter(([, raw]) => {
      if (raw.trim() === "") return false;
      const n = Number(raw);
      return !Number.isFinite(n) || n < 0 || n > max;
    });
  }, [draft, max]);

  const shown = (roster?.items ?? []).filter(
    (i) => !onlyUngraded || i.awarded === null,
  );
  const gradedCount = (roster?.items ?? []).filter(
    (i) => i.awarded !== null,
  ).length;

  async function save() {
    if (!roster || changed.length === 0 || invalid.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await setManualScores(examId, questionId, changed);
      onGraded?.(
        `Q${questionNumber}: ${res.graded} candidate(s) graded — ` +
          `${res.recalculated.evaluated} result(s) recalculated, max now ${res.recalculated.maxScore}.`,
      );
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Those awards were not saved.");
      setSaving(false);
    }
  }

  /** Give everyone who has not been graded yet the same mark. */
  function fillUngraded(value: string) {
    if (!roster) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const i of roster.items) {
        if (i.awarded === null && (next[i.attemptId] ?? "").trim() === "") {
          next[i.attemptId] = value;
        }
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-admin-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-admin-ink">
              Manual evaluation — Q{questionNumber}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-admin-muted">
              {roster?.statement ?? "Loading…"}
            </p>
            {roster && (
              <p className="mt-1 text-xs text-admin-subtle">
                {roster.section ? `${roster.section} · ` : ""}
                up to {roster.maxMarks} marks · answer key:{" "}
                {formatAnswer(
                  roster.answerKey as string | number | string[] | null,
                )}{" "}
                · {gradedCount} of {roster.items.length} graded
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {roster && roster.scoring !== "MANUAL" && (
          <p className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This question is set to <strong>{roster.scoring}</strong>, not
            Manual. Awards made here would be overwritten the next time the exam
            is scored — set it to Manual first.
          </p>
        )}

        {roster && roster.items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-admin-line/60 px-6 py-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-admin-muted">
              <input
                type="checkbox"
                checked={onlyUngraded}
                onChange={(e) => setOnlyUngraded(e.target.checked)}
                className="size-3.5 accent-[var(--color-admin)]"
              />
              Show only ungraded
            </label>
            <span className="ml-auto flex items-center gap-2 text-xs text-admin-muted">
              Give every ungraded candidate
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value !== "") fillUngraded(e.target.value);
                  e.currentTarget.value = "";
                }}
                aria-label="Fill ungraded candidates with a mark"
                className="rounded-lg border border-admin-line px-2 py-1 text-xs font-semibold text-admin-ink outline-none focus:border-admin"
              >
                <option value="">choose…</option>
                <option value="0">0</option>
                {max > 0 && <option value={String(max)}>{max} (full)</option>}
              </select>
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {roster === null && !error ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg bg-admin-line/20"
                />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="rounded-xl border border-admin-line/60 bg-admin-bg p-4 text-sm text-admin-muted">
              {roster?.items.length === 0
                ? "Nobody has submitted this exam yet, so there is nothing to grade."
                : "Every candidate has been graded."}
            </p>
          ) : (
            <ul className="divide-y divide-admin-line/40">
              {shown.map((i) => (
                <GradingRow
                  key={i.attemptId}
                  item={i}
                  max={max}
                  value={draft[i.attemptId] ?? ""}
                  onChange={(v) =>
                    setDraft((prev) => ({ ...prev, [i.attemptId]: v }))
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-admin-line px-6 py-4">
          <span className="text-xs text-admin-muted">
            {invalid.length > 0
              ? `${invalid.length} mark(s) are outside 0–${max}.`
              : changed.length === 0
                ? "No changes to save."
                : `${changed.length} award(s) ready. Saving re-scores the exam once.`}
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || changed.length === 0 || invalid.length > 0}
              onClick={() => void save()}
              className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save awards"}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}

/**
 * One candidate.
 *
 * The answer sits next to the marks box rather than behind a click: grading is
 * a repetitive read-then-type action, and anything that needs opening turns a
 * hundred candidates into two hundred interactions.
 */
function GradingRow({
  item,
  max,
  value,
  onChange,
}: {
  item: ManualRosterItem;
  max: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const n = value.trim() === "" ? null : Number(value);
  const bad = n !== null && (!Number.isFinite(n) || n < 0 || n > max);
  const answered =
    item.status === "ANSWERED" || item.status === "ANSWERED_MARKED";

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-admin-ink">
          {item.student.name}{" "}
          <span className="font-normal text-admin-muted">
            · {item.student.rollNumber}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-admin-subtle">
          {item.student.batch ? `${item.student.batch} · ` : ""}
          {answered ? (
            <>
              answered:{" "}
              <span className="font-mono text-admin-ink">
                {formatAnswer(item.answer as string | number | string[] | null)}
              </span>
            </>
          ) : (
            "not answered"
          )}
        </p>
      </div>

      {item.awarded !== null && (
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
          {item.awarded} awarded
        </span>
      )}

      <label className="flex shrink-0 items-center gap-1.5">
        <span className="sr-only">
          Marks for {item.student.name} ({item.student.rollNumber})
        </span>
        <input
          type="number"
          min={0}
          max={max}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className={`w-20 rounded-lg border px-2 py-1.5 text-right text-sm outline-none ${
            bad
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-admin-line text-admin-ink focus:border-admin"
          }`}
        />
        <span className="text-xs text-admin-muted">/ {max}</span>
      </label>
    </li>
  );
}
