"use client";

import { useState } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";

import {
  AlertTriangleIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "./icons";

// All four components rely on a `key={examId}` from the parent so they
// remount with the new row's defaults — which is what `useEffect` was
// trying to achieve here, more verbosely and with the lint issues the
// new state-effect rules flag. See `key`-driven remounts in /admin/exams.

/**
 * Live-exam admin controls: pause, resume, force-end, live-edit. Three small
 * centered modals + a sidebar-style drawer for the time/duration edit.
 *
 * Each modal asks for a short reason because every admin action should leave
 * a paper trail — even when reason is optional, the form asks for it so an
 * "I forgot" support ticket is the admin's word against a blank row.
 *
 * Mounted from `/admin/exams`. State lives in the page; this is the chrome.
 */

const inputCls =
  "w-full rounded-lg border border-admin-line/60 bg-white px-3 py-2 text-sm outline-none focus:border-admin focus:ring-2 focus:ring-admin/20";
const dangerInputCls =
  "w-full rounded-lg border border-danger/40 bg-white px-3 py-2 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/20";

/** Modal shell. Class name is owned by the caller. */
function Frame({
  open,
  onClose,
  title,
  children,
  footer,
  size = "sm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  size?: "sm" | "md";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-admin-ink/40 p-4">
      <div
        className={
          "w-full rounded-2xl bg-white shadow-2xl " +
          (size === "md" ? "max-w-[640px]" : "max-w-[420px]")
        }
      >
        <header className="flex items-start justify-between border-b border-admin-line/60 px-6 py-5">
          <h2 className="text-lg font-bold text-admin-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-4" />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-6 py-4">
          {footer}
        </footer>
      </div>
    </div>
  );
}

/**
 * Pause modal. Asks for an optional reason — usually something like
 * "wrong paper scheduled" or "extension received, recalibrating". The
 * candidate portal hides the exam as soon as the API flips the status; no
 * separate validation needed in the UI.
 */
export function PauseExamModal({
  open,
  examTitle,
  defaultReason,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  examTitle: string;
  /** Pre-fills the reason with whatever the row already carries, so a
   *  pause-with-no-reason that is then paused-again keeps the existing copy. */
  defaultReason: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string | undefined) => Promise<void> | void;
}) {
  // Lazy initialiser reads `defaultReason` exactly once at mount. The
  // parent mounts with `key={examId}`, so an admin re-opening on a
  // different row gets a fresh state without needing a reset effect.
  const [reason, setReason] = useState(() => defaultReason ?? "");
  return (
    <Frame
      open={open}
      onClose={onClose}
      title={`Pause "${examTitle}"?`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line/60 bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm(reason.trim() || undefined)}
            className="flex items-center gap-2 rounded-lg bg-warn px-4 py-2 text-sm font-bold text-white hover:bg-warn/90 disabled:opacity-60"
          >
            {busy ? (
              <LoadingSpinner size={14} />
            ) : (
              <PauseIcon className="size-4" />
            )}
            Pause exam
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-admin-ink">
        <p className="flex items-start gap-2 text-admin-muted">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            The exam stays on the schedule but disappears from the candidate
            portal. In-flight attempts&apos; deadlines are preserved so resuming
            does not cost candidates their allotted time.
          </span>
        </p>
        <label className="block">
          <span className="font-semibold text-admin-muted">Reason</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. wrong paper scheduled"
            className={inputCls}
            disabled={busy}
            maxLength={500}
          />
        </label>
      </div>
    </Frame>
  );
}

/**
 * Force-end modal. Distinct copy + tone from Pause — this terminates
 * every IN_PROGRESS attempt as flagged AUTO_SUBMITTED. The reason becomes
 * part of the candidate's support trail.
 */
export function ForceEndExamModal({
  open,
  examTitle,
  defaultReason,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  examTitle: string;
  defaultReason: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string | undefined) => Promise<void> | void;
}) {
  // Same key-driven pattern as the pause modal — the parent remounts this
  // component on row change, so a lazy initialiser is enough to read the
  // current default once.
  const [reason, setReason] = useState(() => defaultReason ?? "");
  return (
    <Frame
      open={open}
      onClose={onClose}
      title={`End "${examTitle}" now?`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line/60 bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm(reason.trim() || undefined)}
            className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white hover:bg-danger/90 disabled:opacity-60"
          >
            {busy ? <LoadingSpinner size={14} /> : null}
            End exam and auto-submit
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3 text-danger">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <span className="font-semibold">
            This archives the exam and auto-submits every in-progress attempt as
            flagged. You will not be able to resume.
          </span>
        </p>
        <p className="text-admin-muted">
          Candidates who were mid-question keep what they typed. Use this for
          outsized incidents — never as a workaround for a scheduling mix-up
          (use Pause + Resume for that).
        </p>
        <label className="block">
          <span className="font-semibold text-admin-muted">
            Reason (recorded on the audit row)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. security incident"
            className={dangerInputCls}
            disabled={busy}
            maxLength={500}
          />
        </label>
      </div>
    </Frame>
  );
}

/**
 * Resume is a single click. The narrow use case (resuming a held exam) does
 * not justify a confirmation dialog, but it does deserve a tiny modal that
 * shows the current pause reason so the admin can decide if the cause is
 * resolved — which is what was missing in the live row.
 */
export function ResumeExamModal({
  open,
  examTitle,
  currentReason,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  examTitle: string;
  currentReason: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <Frame
      open={open}
      onClose={onClose}
      title={`Resume "${examTitle}"?`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line/60 bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="flex items-center gap-2 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:bg-admin/90 disabled:opacity-60"
          >
            {busy ? (
              <LoadingSpinner size={14} />
            ) : (
              <PlayIcon className="size-4" />
            )}
            Resume exam
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-admin-ink">
        <p className="text-admin-muted">
          The exam reappears on the candidate portal and resumes from the same
          window. In-flight attempts&apos; clocks are extended by the pause
          duration so the candidate does not lose writing time.
        </p>
        {currentReason && (
          <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-warn">
              Current hold reason
            </p>
            <p className="mt-1 text-sm text-admin-ink">{currentReason}</p>
            <p className="mt-2 text-xs text-admin-muted">
              Confirm the underlying issue is resolved before resuming.
            </p>
          </div>
        )}
      </div>
    </Frame>
  );
}

/**
 * Live-edit drawer. STRICT subset of fields — duration, start, end,
 * instructions, passingMarks. The class-level gate (`UpdateLiveExamDto`
 * on the server) ensures section/question mutations cannot reach a
 * running paper through this shape.
 *
 * Pre-populated from the most recent ExamDetail fetch the parent made.
 */
export function LiveEditExamDrawer({
  examTitle,
  current,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  examTitle: string;
  current: {
    durationMinutes: number;
    startAt: string | null;
    endAt: string | null;
    instructions: string | null;
    passingMarks: number | null;
  } | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    durationMinutes?: number;
    startAt?: string;
    endAt?: string;
    instructions?: string;
    passingMarks?: number;
  }) => Promise<void> | void;
}) {
  // Lazy initialisers seed each field the first time this drawer is
  // mounted with a `current` payload. After mount the parent passes
  // `key={examId}`, so opening on a different row naturally gives a fresh
  // form without a setState-in-effect.
  const seed = current ?? {
    durationMinutes: 60,
    startAt: null,
    endAt: null,
    instructions: null,
    passingMarks: null,
  };
  const [duration, setDuration] = useState(() => String(seed.durationMinutes));
  const [startAt, setStartAt] = useState(() =>
    seed.startAt ? seed.startAt.slice(0, 16) : "",
  );
  const [endAt, setEndAt] = useState(() =>
    seed.endAt ? seed.endAt.slice(0, 16) : "",
  );
  const [passing, setPassing] = useState(() =>
    seed.passingMarks != null ? String(seed.passingMarks) : "",
  );
  const [instructions, setInstructions] = useState(
    () => seed.instructions ?? "",
  );

  // Time inputs are local datetime-local strings; convert to ISO on submit.
  function toIso(local: string): string | undefined {
    if (!local) return undefined;
    return new Date(local).toISOString();
  }

  function parsePositiveInt(v: string): number | undefined {
    if (!v.trim()) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1"
      />
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Live exam / edit timing
            </p>
            <h2 className="mt-1 text-2xl font-bold text-admin-ink">
              {examTitle}
            </h2>
            <p className="flex items-center gap-1 text-sm text-admin-muted">
              <ClockIcon className="size-4" />
              Edits apply within the running window
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-admin-bg px-8 py-6">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <section className="space-y-4 rounded-xl border border-admin-line/60 bg-white p-5">
            <label className="block text-sm">
              <span className="font-semibold text-admin-muted">
                Duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={inputCls}
                disabled={busy}
              />
              <span className="mt-1 block text-xs text-admin-subtle">
                Editing this does NOT auto-extend in-flight attempts — they
                carry their original <code>expiresAt</code>. Pause + Resume to
                shift the candidate clock.
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-admin-muted">
                Window opens at
              </span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className={inputCls}
                disabled={busy}
              />
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-admin-muted">
                Window closes at
              </span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className={inputCls}
                disabled={busy}
              />
              <span className="mt-1 block text-xs text-admin-subtle">
                Moving the deadline earlier auto-clamps in-flight attempts to
                the new boundary.
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-admin-muted">
                Passing marks (optional)
              </span>
              <input
                type="number"
                min={0}
                value={passing}
                onChange={(e) => setPassing(e.target.value)}
                className={inputCls}
                disabled={busy}
              />
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-admin-muted">
                Instructions (live)
              </span>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className={`${inputCls} h-32 resize-y`}
                disabled={busy}
                maxLength={50_000}
              />
              <span className="mt-1 block text-xs text-admin-subtle">
                Renders to candidates on the exam instructions page. Editable
                while the exam is open; once the exam ends, surface text is
                frozen for the historical record.
              </span>
            </label>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 bg-white px-8 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line/60 bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const input: {
                durationMinutes?: number;
                startAt?: string;
                endAt?: string;
                instructions?: string;
                passingMarks?: number;
              } = {};
              const d = parsePositiveInt(duration);
              if (d && d !== current?.durationMinutes)
                input.durationMinutes = d;
              const s = toIso(startAt);
              if (s) input.startAt = s;
              const e = toIso(endAt);
              if (e) input.endAt = e;
              const p = parsePositiveInt(passing);
              if (p != null) input.passingMarks = p;
              if (instructions !== (current?.instructions ?? ""))
                input.instructions = instructions;
              if (Object.keys(input).length === 0) {
                onClose();
                return;
              }
              void onSubmit(input);
            }}
            className="flex items-center gap-2 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:bg-admin/90 disabled:opacity-60"
          >
            {busy ? <LoadingSpinner size={14} /> : null}
            Save live edits
          </button>
        </footer>
      </div>
    </div>
  );
}
