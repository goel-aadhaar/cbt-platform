"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PlusIcon } from "@/components/admin/icons";
import { ExamBuilderDrawer } from "@/components/admin/exam-builder-drawer";
import { Panel, StatusPill } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { fetchExam, submitExamForReview, type ExamDetail } from "@/lib/admin";
import { getUserSnapshot } from "@/lib/auth";
import {
  examDisplayStatus,
  formatSchedule,
  listExams,
  type ExamListItem,
} from "@/lib/exams";

export default function TeacherExamsPage() {
  return (
    <Suspense fallback={null}>
      <ExamsScreen />
    </Suspense>
  );
}

function ExamsScreen() {
  const params = useSearchParams();
  const me = getUserSnapshot();
  const [exams, setExams] = useState<ExamListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [building, setBuilding] = useState(params.get("new") === "1");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [editingExam, setEditingExam] = useState<ExamDetail | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);
  const [resubmitting, setResubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setExams((await listExams()).items);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load exams");
      setExams([]);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const visible = (exams ?? []).filter(
    (e) => scope === "all" || e.createdBy?.id === me?.id,
  );

  /**
   * Open an existing exam in the wizard.
   *
   * The list row is a summary; the wizard needs the full paper — sections,
   * their questions and the batches — so it is fetched before opening rather
   * than opening empty and filling in underneath the author.
   */
  async function openForEdit(examId: string) {
    setLoadingEdit(examId);
    setError(null);
    try {
      const detail = await fetchExam(examId);
      setEditingExam(detail);
      setBuilding(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not open that exam.",
      );
    } finally {
      setLoadingEdit(null);
    }
  }

  /**
   * Send a corrected paper back to the same admin who returned it.
   *
   * Reusing the original reviewer is deliberate: they already have the context
   * of why it came back, and a rejection does not clear `reviewerId`.
   */
  async function resubmit(e: ExamListItem) {
    if (!e.reviewer?.id) {
      setError(
        "This paper has no reviewer yet. Open it with Edit, choose one on the " +
          "Approval step, then use Save & send for approval.",
      );
      return;
    }
    setResubmitting(e.id);
    setError(null);
    try {
      await submitExamForReview(e.id, e.reviewer.id);
      setNotice(`"${e.title}" resubmitted to ${e.reviewer.name}.`);
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not resubmit the exam.",
      );
    } finally {
      setResubmitting(null);
    }
  }

  return (
    <TeacherShell title="My Exams">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["mine", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                scope === s
                  ? "bg-admin text-white"
                  : "border border-admin-line bg-white text-admin-ink hover:bg-admin-bg"
              }`}
            >
              {s === "mine" ? "Mine" : "All exams"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="ml-auto flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />
          New exam
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-admin/30 bg-admin/5 px-4 py-3 text-sm font-semibold text-admin">
          {notice}
        </p>
      )}

      <Panel
        title={exams ? `${visible.length} exams` : "Exams"}
        subtitle="You build the paper and send it for approval; an administrator schedules and publishes it."
      >
        {exams === null ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-admin-line/15"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-admin-line p-10 text-center">
            <p className="text-sm text-admin-muted">
              {scope === "mine"
                ? "You have not authored an exam yet."
                : "No exams in this institute yet."}
            </p>
            <button
              type="button"
              onClick={() => setBuilding(true)}
              className="mt-3 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
            >
              Build a paper
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((e) => {
              const status = examDisplayStatus(e);
              return (
                <li
                  key={e.id}
                  className="rounded-xl border border-admin-line/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-admin-ink">{e.title}</p>
                      <p className="mt-0.5 text-xs text-admin-muted">
                        {e._count.questions} questions · {e._count.sections}{" "}
                        sections · {e.durationMinutes} min · {formatSchedule(e)}
                      </p>
                      {e.createdBy && scope === "all" && (
                        <p className="mt-0.5 text-xs text-admin-subtle">
                          by{" "}
                          {e.createdBy.id === me?.id ? "you" : e.createdBy.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        tone={
                          status === "REVIEW"
                            ? "warn"
                            : status === "DRAFT" || status === "ARCHIVED"
                              ? "muted"
                              : "good"
                        }
                      >
                        {status === "REVIEW" ? "Awaiting approval" : status}
                      </StatusPill>
                      {/*
                        Editing is what makes a rejection actionable. Offered
                        only where the API will accept it — anything past
                        approval is someone else's now, and a button that
                        always 400s is worse than no button.
                      */}
                      {(e.status === "DRAFT" || e.status === "REJECTED") && (
                        <button
                          type="button"
                          onClick={() => void openForEdit(e.id)}
                          disabled={loadingEdit === e.id}
                          className="flex items-center gap-1.5 rounded-lg border border-admin-line px-2.5 py-1.5 text-xs font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                        >
                          {loadingEdit === e.id ? "Opening…" : "Edit"}
                        </button>
                      )}
                      {/*
                        Offered for DRAFT as well as REJECTED. A fresh draft —
                        one saved part-way — previously had no way to be
                        sent at all: Edit ended at "Save changes", so it could
                        be worked on forever and never submitted.
                      */}
                      {(e.status === "DRAFT" || e.status === "REJECTED") && (
                        <button
                          type="button"
                          onClick={() => void resubmit(e)}
                          disabled={resubmitting === e.id}
                          title={
                            e.reviewer
                              ? `Send to ${e.reviewer.name} for approval`
                              : "Open with Edit to choose a reviewer first"
                          }
                          className="flex items-center gap-1.5 rounded-lg bg-admin px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
                        >
                          {resubmitting === e.id
                            ? "Sending…"
                            : e.status === "DRAFT"
                              ? "Send for approval"
                              : "Resubmit for approval"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* The approval trail: who has it, and what came back. */}
                  {e.status === "REVIEW" && e.reviewer && (
                    <p className="mt-2 text-xs font-semibold text-admin-muted">
                      With {e.reviewer.name} for approval
                    </p>
                  )}
                  {e.rejectionReason &&
                    (e.status === "REJECTED" || e.status === "DRAFT") && (
                      <p className="mt-2 rounded-lg border border-[#f0ad4e]/40 bg-[#fff8ec] px-3 py-2 text-xs text-admin-ink">
                        <span className="font-bold">Sent back:</span>{" "}
                        {e.rejectionReason}
                      </p>
                    )}
                  {e.approvedAt && e.approvedBy && (
                    <p className="mt-2 text-xs font-semibold text-admin">
                      Approved by {e.approvedBy.name}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <ExamBuilderDrawer
        // Remounted per target so the wizard re-seeds instead of carrying the
        // previous exam's sections into the next one.
        key={editingExam?.id ?? "new"}
        open={building}
        editing={editingExam}
        onClose={() => {
          setBuilding(false);
          setEditingExam(null);
        }}
        onCreated={(_id, title) => {
          setNotice(
            editingExam
              ? `"${title}" saved. Resubmit it when you are ready.`
              : `"${title}" sent for approval.`,
          );
          setEditingExam(null);
          void load();
        }}
      />
    </TeacherShell>
  );
}
