"use client";

import { useState } from "react";

const REJECT_REASONS = [
  "Incomplete questions",
  "Wrong marks scheme",
  "Needs more sections",
  "Other",
] as const;

/**
 * Structured "send back to the author" picker — a canned reason plus
 * optional free-text detail, in place of a bare `window.prompt`. Shared by
 * the exam list's quick-action reject and the review workspace, so a
 * rejection always looks the same to the author regardless of where the
 * admin sent it from.
 */
export function RejectExamModal({
  examTitle,
  authorName,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  examTitle: string;
  authorName: string;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string | undefined) => void;
}) {
  const [choice, setChoice] = useState<(typeof REJECT_REASONS)[number] | "">(
    "",
  );
  const [detail, setDetail] = useState("");

  function submit() {
    const reason =
      choice === "Other" || !choice
        ? detail.trim()
        : detail.trim()
          ? `${choice}: ${detail.trim()}`
          : choice;
    onConfirm(reason || undefined);
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-admin-ink/40 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-admin-ink">
          Send back to {authorName}
        </p>
        <p className="mt-1 text-xs text-admin-muted">
          &quot;{examTitle}&quot; — pick a reason so the author knows what to
          fix.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {REJECT_REASONS.map((r) => (
            <label
              key={r}
              className="flex items-center gap-2 rounded-lg border border-admin-line/60 px-3 py-2 text-sm text-admin-ink hover:bg-admin-bg"
            >
              <input
                type="radio"
                name="reject-reason"
                checked={choice === r}
                onChange={() => setChoice(r)}
                className="accent-admin"
              />
              {r}
            </label>
          ))}
        </div>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Add detail (optional for a preset reason, recommended for Other)…"
          rows={3}
          className="mt-3 w-full rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin"
        />
        {error && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-admin-line px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || (!choice && !detail.trim())}
            className="rounded-lg bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Sending back…" : "Send back"}
          </button>
        </div>
      </div>
    </div>
  );
}
