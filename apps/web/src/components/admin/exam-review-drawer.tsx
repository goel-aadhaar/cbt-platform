"use client";

import { useEffect, useState } from "react";

import {
  approveExam,
  fetchExam,
  rejectExam,
  type ExamDetail,
} from "@/lib/admin";
import {
  runPreflightChecks,
  type PreflightSection,
} from "@/lib/exam-preflight";
import { computeExamStats, type StatsSection } from "@/lib/exam-stats";

import { CheckIcon, EyeIcon, XIcon } from "./icons";
import { PreFlightPanel } from "./preflight-panel";
import { QuestionPreviewModal } from "./question-preview-modal";
import { RejectExamModal } from "./reject-exam-modal";
import { useQuestionPreview } from "./use-question-preview";

function sectionAnchor(sectionId: string) {
  return `review-section-${sectionId}`;
}

function toStatsSections(exam: ExamDetail): StatsSection[] {
  return exam.sections.map((s) => ({
    name: s.name,
    marksCorrect: s.marksCorrect,
    marksWrong: s.marksWrong,
    questions: s.questions.map((q) => ({
      type: q.question.type as StatsSection["questions"][number]["type"],
      marks: q.question.marks,
      difficulty: q.question.difficulty,
    })),
  }));
}

function toPreflightSections(exam: ExamDetail): PreflightSection[] {
  return exam.sections.map((s) => ({
    name: s.name,
    marksWrong: s.marksWrong,
    questions: s.questions.map((q) => ({
      id: q.question.id,
      topicId: q.question.topicId,
      mediaKeys: q.question.mediaKeys,
    })),
  }));
}

/**
 * Exam Review Workspace (§2.3) — the "open the exam and see everything before
 * deciding" surface an admin uses to act on a submitted paper. REVIEW-status
 * exams get inline Approve/Reject; other statuses are view-only history.
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

  const [uiMode, setUiMode] = useState<"view" | "reject" | "confirmApprove">(
    "view",
  );

  const preview = useQuestionPreview();

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
      setUiMode("view");
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason: string | undefined) {
    if (!examId) return;
    setBusy(true);
    setError(null);
    try {
      await rejectExam(examId, reason);
      onActioned?.("reject");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject.");
      setUiMode("view");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const stats = exam
    ? computeExamStats(toStatsSections(exam), exam.durationMinutes)
    : null;
  const preflight = exam
    ? runPreflightChecks(toPreflightSections(exam), exam.durationMinutes)
    : null;

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

        <div className="flex flex-1 overflow-hidden">
          {/* Section-jump nav — only worth showing once there's more than one. */}
          {exam && exam.sections.length > 1 && (
            <nav className="hidden w-48 shrink-0 overflow-auto border-r border-admin-line/60 px-4 py-6 md:block">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
                Sections
              </p>
              <ul className="flex flex-col gap-1">
                {exam.sections.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(sectionAnchor(s.id))
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                      className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
                    >
                      {i + 1}. {s.name || "Untitled"}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="flex-1 overflow-auto px-8 py-6">
            {loading && (
              <p className="text-sm text-admin-muted">Loading exam…</p>
            )}
            {!loading && error && (
              <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {!loading && !error && exam && stats && preflight && (
              <div className="flex flex-col gap-6">
                {exam.status === "DRAFT" && exam.rejectionReason && (
                  <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                    Sent back to the author: {exam.rejectionReason}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4 rounded-xl border border-admin-line/60 p-4 text-sm sm:grid-cols-4">
                  <Meta label="Category" value={exam.category?.name ?? "—"} />
                  <Meta
                    label="Duration"
                    value={`${exam.durationMinutes} min`}
                  />
                  <Meta
                    label="Questions"
                    value={String(exam._count.questions)}
                  />
                  <Meta label="Batches" value={String(exam._count.batches)} />
                  <Meta
                    label="Submitted by"
                    value={exam.createdBy?.name ?? "—"}
                  />
                  <Meta label="Reviewer" value={exam.reviewer?.name ?? "—"} />
                  <Meta
                    label="Passing marks"
                    value={
                      exam.passingMarks !== null
                        ? String(exam.passingMarks)
                        : "—"
                    }
                  />
                  <Meta label="Status" value={exam.status} />
                </div>

                <ApprovalHistory exam={exam} />

                <PreFlightPanel stats={stats} preflight={preflight} />

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
                        id={sectionAnchor(s.id)}
                        className="scroll-mt-6 rounded-xl border border-admin-line/60"
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
                              <button
                                type="button"
                                onClick={() =>
                                  preview.openPreview(q.question.id)
                                }
                                aria-label="Preview question as a student will see it"
                                className="shrink-0 rounded p-1 text-admin-muted hover:bg-admin-bg hover:text-admin"
                              >
                                <EyeIcon className="size-4" />
                              </button>
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
        </div>

        {exam?.status === "REVIEW" && (
          <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
            <button
              onClick={() => setUiMode("reject")}
              disabled={busy}
              className="rounded-lg border border-admin-line bg-white px-5 py-2.5 text-sm font-bold uppercase text-danger hover:bg-danger-soft/30 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => setUiMode("confirmApprove")}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-admin px-6 py-2.5 text-sm font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
            >
              <CheckIcon className="size-4" /> Approve
            </button>
          </footer>
        )}
      </div>

      {uiMode === "reject" && exam && (
        <RejectExamModal
          examTitle={exam.title}
          authorName={exam.createdBy?.name ?? "the author"}
          busy={busy}
          error={error}
          onCancel={() => setUiMode("view")}
          onConfirm={(reason) => void reject(reason)}
        />
      )}

      {uiMode === "confirmApprove" && exam && stats && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-admin-ink/40 p-4"
          onClick={() => (busy ? null : setUiMode("view"))}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-admin-ink">
              Approve &quot;{exam.title}&quot;?
            </p>
            <p className="mt-1 text-xs text-admin-muted">
              This moves it into the qualified pool. Batches, scheduling and
              publishing happen afterward.
            </p>
            <ul className="mt-4 flex flex-col gap-1.5 rounded-xl border border-admin-line/60 p-4 text-sm text-admin-ink">
              <li>{stats.totalSections} section(s)</li>
              <li>{stats.totalQuestions} question(s)</li>
              <li>{stats.totalMarks} total marks</li>
              <li>Duration: {stats.durationMinutes} minutes</li>
            </ul>
            {error && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setUiMode("view")}
                disabled={busy}
                className="rounded-lg border border-admin-line px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void approve()}
                disabled={busy}
                className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                {busy ? "Approving…" : "Confirm approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      <QuestionPreviewModal
        open={preview.open}
        loading={preview.loading}
        errorMessage={preview.errorMessage}
        detail={preview.detail}
        onClose={preview.closePreview}
      />
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

/**
 * `submitted → (sent back, if any) → approved` from fields already on the
 * `Exam` row — no separate history model exists (or is needed) for this.
 */
function ApprovalHistory({ exam }: { exam: ExamDetail }) {
  const steps: { label: string; detail?: string }[] = [];
  if (exam.submittedAt) {
    steps.push({
      label: `Submitted by ${exam.createdBy?.name ?? "the author"}`,
      detail: new Date(exam.submittedAt).toLocaleString(),
    });
  }
  if (exam.rejectionReason) {
    steps.push({
      label: "Sent back for changes",
      detail: exam.rejectionReason,
    });
  }
  if (exam.approvedAt) {
    steps.push({
      label: `Approved by ${exam.approvedBy?.name ?? "an admin"}`,
      detail: new Date(exam.approvedAt).toLocaleString(),
    });
  }
  if (steps.length === 0) return null;

  return (
    <section>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
        Approval history
      </p>
      <ol className="flex flex-col gap-3 rounded-xl border border-admin-line/60 p-4">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-admin" />
            <span>
              <span className="block font-semibold text-admin-ink">
                {s.label}
              </span>
              {s.detail && (
                <span className="mt-0.5 block text-xs text-admin-muted">
                  {s.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
