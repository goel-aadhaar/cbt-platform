"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { InfoIcon, LockClosedIcon } from "@/components/icons";

/**
 * Confirmation for the exam screen's Logout button.
 *
 * Leaving is NOT a submission: the server discards everything the candidate
 * has answered. It still spends their single attempt, so this has to be said
 * plainly — it is the more destructive of the two exits, and it used to submit
 * the paper instead.
 */
export function LeaveConfirmModal({
  answeredCount,
  onCancel,
  onConfirm,
}: {
  answeredCount: number;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

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

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-confirm-title"
    >
      <div className="w-full max-w-lg border border-line bg-white shadow-xl">
        <div className="border-b border-line bg-surface-2 px-6 py-4">
          <h2
            id="leave-confirm-title"
            className="flex items-center gap-2 text-lg font-bold uppercase text-alert"
          >
            <LockClosedIcon className="h-5 w-4 shrink-0" />
            Leave Without Submitting?
          </h2>
        </div>

        <div className="px-6 py-5">
          <div className="flex gap-3 border border-alert bg-alert/5 p-4">
            <InfoIcon className="size-5 shrink-0 text-alert" />
            <div>
              <p className="text-sm font-bold uppercase text-alert">
                Your answers will not be saved
              </p>
              <p className="mt-1 text-sm text-ink">
                Logging out discards this attempt. Only a submitted paper is
                evaluated, so{" "}
                {answeredCount > 0 ? (
                  <>
                    the{" "}
                    <span className="font-bold">
                      {answeredCount} question
                      {answeredCount === 1 ? "" : "s"}
                    </span>{" "}
                    you have answered will be lost
                  </>
                ) : (
                  <>nothing from this session will be kept</>
                )}
                .
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm font-semibold text-ink">
            You will not be able to enter this exam again.
          </p>
          <p className="mt-1 text-sm text-muted">
            Leaving uses up your one attempt. If you want your work counted, go
            back and use Submit Exam instead.
          </p>
        </div>

        <div className="flex gap-3 border-t border-line bg-surface-2 px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="flex-1 border border-subtle bg-surface px-5 py-3 text-base font-bold uppercase text-ink hover:bg-fill disabled:opacity-40"
          >
            Back to Exam
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex-1 bg-alert px-5 py-3 text-base font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Leaving…" : "Leave and Discard"}
          </button>
        </div>
      </div>
    </div>
  );
}
