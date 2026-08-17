"use client";

import { useCallback, useEffect } from "react";

import { InfoIcon } from "@/components/icons";

/**
 * The exam's own instructions, set by the teacher who authored it
 * (`Exam.instructions`, already carried on `AttemptState.exam` — this button
 * previously did nothing even though the text was already on the page).
 */
export function InstructionsModal({
  instructions,
  onClose,
}: {
  instructions: string | null;
  onClose: () => void;
}) {
  const dismiss = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-title"
    >
      <div className="w-full max-w-lg border border-line bg-white shadow-xl">
        <div className="border-b border-line bg-surface-2 px-6 py-4">
          <h2
            id="instructions-title"
            className="flex items-center gap-2 text-lg font-bold uppercase text-ink"
          >
            <InfoIcon className="size-5 shrink-0" />
            Instructions
          </h2>
        </div>

        <div className="max-h-[60vh] overflow-auto px-6 py-5">
          {instructions ? (
            <p className="whitespace-pre-wrap text-sm text-ink">
              {instructions}
            </p>
          ) : (
            <p className="text-sm text-muted">
              No special instructions were set for this exam.
            </p>
          )}
        </div>

        <div className="border-t border-line bg-surface-2 px-6 py-4">
          <button
            type="button"
            onClick={dismiss}
            className="w-full bg-ink px-5 py-3 text-base font-bold uppercase text-white hover:opacity-95"
          >
            Back to Exam
          </button>
        </div>
      </div>
    </div>
  );
}
