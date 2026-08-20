"use client";

import { useEffect, useState } from "react";

import {
  approveExam,
  fetchExam,
  rejectExam,
  type ExamDetail,
} from "@/lib/admin";

import { CheckIcon, XIcon } from "./icons";

/**
 * Read-only view of a submitted/approved exam — the "open the exam and see
 * all the questions" gap in the approval flow (§2.3). REVIEW-status exams get
 * inline Approve/Reject so an admin doesn't have to close this to act on what
 * they just read; other statuses are view-only.
 */
export function ExamReviewDrawer({
  open,
  onClose,
  examId,
  onActioned,
}: {
  open: boolean;
  onClose: () => void;
  examId?: string;
  onActioned?: (action: "approve" | "reject") => void;
}) {
  // A fresh mount per exam (parent keys this drawer by examId) is what makes
  // `true` the right initial value here — no synchronizing reset needed in
  // the effect below, which would otherwise call setState synchronously in
  // the effect body.
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !examId) return;
    let cancelled = false;
    fetchExam(examId)
      .then((e) => {
        if (!cancelled) setExam(e);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load the exam.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, examId]);

  async function approve() {
    if (!examId) return;
    setBusy(true);
    setError(null);
    try {
      await approveExam(examId);
      onActioned?.("approve");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!examId || !exam) return;
    const reason = window.prompt(
      `Send "${exam.title}" back to ${exam.createdBy?.name ?? "its author"}. Reason (optional):`,
    );
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await rejectExam(examId, reason || undefined);
      onActioned?.("reject");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject.");
    } finally {
      setBusy(false);
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

      <div className="relative flex h-full w-full flex-col bg-white shadow-2xl lg:w-[calc(100vw-280px)]">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Exams / Review
            </p>
            <h2 className="mt-1 text-xl font-bold text-admin-ink">
              {exam?.title ?? "Loading…"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          {loading && <p className="text-sm text-admin-muted">Loading exam…</p>}
          {!loading && error && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {!loading && !error && exam && (
            <div className="flex flex-col gap-6">
              {exam.status === "DRAFT" && exam.rejectionReason && (
                <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  Sent back to the author: {exam.rejectionReason}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 rounded-xl border border-admin-line/60 p-4 text-sm sm:grid-cols-4">
                <Meta label="Category" value={exam.category?.name ?? "—"} />
                <Meta label="Duration" value={`${exam.durationMinutes} min`} />
                <Meta label="Questions" value={String(exam._count.questions)} />
                <Meta label="Batches" value={String(exam._count.batches)} />
                <Meta
                  label="Submitted by"
                  value={exam.createdBy?.name ?? "—"}
                />
                <Meta label="Reviewer" value={exam.reviewer?.name ?? "—"} />
              </div>

              {exam.instructions && (
                <section>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
                    Instructions
                  </p>
                  <div
                    className="whitespace-pre-line rounded-xl border border-admin-line/60 p-4 text-sm text-admin-ink [&_a]:text-admin [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-admin-line [&_blockquote]:pl-3 [&_blockquote]:text-admin-muted [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: exam.instructions }}
                  />
                </section>
              )}

              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
                  Sections &amp; questions
                </p>
                <div className="flex flex-col gap-4">
                  {exam.sections.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-admin-line/60"
                    >
                      <div className="flex items-center justify-between border-b border-admin-line/60 bg-admin-bg/40 px-4 py-2.5">
                        <p className="text-sm font-bold text-admin-ink">
                          {s.name}
                        </p>
                        <p className="text-xs text-admin-muted">
                          +{s.marksCorrect} / −{s.marksWrong} ·{" "}
                          {s.questions.length} question
                          {s.questions.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <ul className="divide-y divide-admin-line/40">
                        {s.questions.map((q) => (
                          <li
                            key={q.id}
                            className="flex items-start gap-3 p-3 text-sm"
                          >
                            <span className="mt-0.5 rounded bg-admin-surface px-1.5 py-0.5 text-[10px] font-semibold text-admin-muted">
                              {q.question.type}
                            </span>
                            <span className="min-w-0 flex-1 text-admin-ink">
                              {q.question.statement}
                            </span>
                            <span className="shrink-0 text-xs text-admin-subtle">
                              {q.question.subject} · {q.question.marks} marks
                            </span>
                          </li>
                        ))}
                        {s.questions.length === 0 && (
                          <li className="p-3 text-sm text-admin-muted">
                            No questions in this section.
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              {exam.batches.length > 0 && (
                <section>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
                    Assigned batches
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {exam.batches.map((b) => (
                      <span
                        key={b.id}
                        className="rounded-full bg-admin-surface px-3 py-1 text-xs font-semibold text-admin-muted"
                      >
                        {b.batch.name}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {exam?.status === "REVIEW" && (
          <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
            <button
              onClick={() => void reject()}
              disabled={busy}
              className="rounded-lg border border-admin-line bg-white px-5 py-2.5 text-sm font-bold uppercase text-danger hover:bg-danger-soft/30 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => void approve()}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-admin px-6 py-2.5 text-sm font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
            >
              <CheckIcon className="size-4" /> Approve
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-admin-muted">
        {label}
      </p>
      <p className="mt-0.5 font-semibold text-admin-ink">{value}</p>
    </div>
  );
}
