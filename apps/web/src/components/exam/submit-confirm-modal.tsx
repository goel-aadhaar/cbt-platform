"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { InfoIcon, LockClosedIcon } from "@/components/icons";

import { PaletteSquare } from "./palette-square";

/**
 * How long the student must sit with the summary before the irreversible
 * submit unlocks. This is deliberate friction: submitting is final, and a
 * reflexive double-click on "Submit Exam" must not be able to end an attempt.
 */
const CONFIRM_DELAY_SECONDS = 5;

export interface SubmitSummary {
  total: number;
  answered: number;
  notAnswered: number;
  markedForReview: number;
}

/**
 * "Exam Attempt Summary" confirmation (Figma 151:30248).
 *
 * Shown ONLY for a deliberate submit by the student. The forced paths — the
 * countdown hitting zero and the proctoring violation limit — bypass this and
 * submit immediately, because there is nothing left to confirm.
 *
 * Mount conditionally (`{open && <SubmitConfirmModal … />}`) so the countdown
 * restarts from scratch every time it is opened.
 */
export function SubmitConfirmModal({
  summary,
  onCancel,
  onConfirm,
}: {
  summary: SubmitSummary;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [secondsLeft, setSecondsLeft] = useState(CONFIRM_DELAY_SECONDS);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // One interval for the life of the modal. It keeps firing at zero, but the
  // clamped updater returns the same value so React bails out of the re-render.
  useEffect(() => {
    const id = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  // Open with focus on the safe choice, never on the destructive one.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const dismiss = useCallback(() => {
    if (!busy) onCancel();
  }, [busy, onCancel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  const locked = secondsLeft > 0;

  async function confirm() {
    if (locked || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      // The parent swaps in the submitted screen, which unmounts this modal.
      // Re-enabling only matters if that swap never happens.
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-confirm-title"
    >
      <div className="w-full max-w-lg border border-line bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-line bg-surface-2 px-6 py-4">
          <h2
            id="submit-confirm-title"
            className="flex items-center gap-2 text-lg font-bold uppercase text-ink"
          >
            <LockClosedIcon className="h-5 w-4 shrink-0" />
            Exam Attempt Summary
          </h2>
          <p className="mt-1 text-sm text-muted">
            Review your progress before final submission.
          </p>
        </div>

        {/* Counts — same swatches the student has been reading all exam. */}
        <div className="grid grid-cols-3 gap-3 px-6 py-5">
          <Stat n={summary.answered} status="answered" label="Answered" />
          <Stat
            n={summary.notAnswered}
            status="not-answered"
            label="Not Answered"
          />
          <Stat n={summary.markedForReview} status="marked" label="Review" />
        </div>

        {/* Irreversible-action warning */}
        <div className="mx-6 mb-5 flex gap-3 border border-alert bg-alert/5 p-4">
          <InfoIcon className="size-5 shrink-0 text-alert" />
          <div>
            <p className="text-sm font-bold uppercase text-alert">
              Irreversible Action
            </p>
            <p className="mt-1 text-sm text-ink">
              You cannot make changes after final submission. Please review your
              answers if time permits before proceeding.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-line bg-surface-2 px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="flex-1 border border-subtle bg-surface px-5 py-3 text-base font-bold uppercase text-ink hover:bg-fill disabled:opacity-40"
          >
            Go Back to Exam
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={locked || busy}
            aria-describedby={locked ? "submit-confirm-hint" : undefined}
            className="flex flex-1 items-center justify-center gap-2 bg-success px-5 py-3 text-base font-bold uppercase text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LockClosedIcon className="h-4 w-3.5 shrink-0" />
            {busy
              ? "Submitting…"
              : locked
                ? `Submit in ${secondsLeft}…`
                : "Submit and Lock Attempt"}
          </button>
        </div>

        {locked && (
          <p
            id="submit-confirm-hint"
            aria-live="polite"
            className="px-6 pb-4 text-center text-xs text-muted"
          >
            Submission unlocks in {secondsLeft} second
            {secondsLeft === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  n,
  status,
  label,
}: {
  n: number;
  status: "answered" | "not-answered" | "marked";
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 border border-line bg-surface px-2 py-3">
      <PaletteSquare n={n} status={status} className="w-10 text-base" />
      <span className="text-center text-xs font-bold uppercase text-muted">
        {label}
      </span>
    </div>
  );
}
