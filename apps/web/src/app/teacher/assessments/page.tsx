"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PlusIcon } from "@/components/admin/icons";
import { ExamBuilderDrawer } from "@/components/admin/exam-builder-drawer";
import { Panel, StatusPill } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { fetchExam, type ExamDetail } from "@/lib/admin";
import { getUserSnapshot } from "@/lib/auth";
import {
  examDisplayStatus,
  formatSchedule,
  listExams,
  type ExamListItem,
} from "@/lib/exams";

/**
 * Assessments (§ Assessments) — a teacher creates and schedules these
 * directly, with no admin review/approval/live-monitoring step, unlike Mock
 * Tests on the sibling "My Exams" page. Deliberately its own screen rather
 * than a tab on that one: the two have genuinely different lifecycles
 * (DRAFT → PUBLISHED → auto-CLOSED here, vs. the multi-party review chain
 * there), and conflating them risked a teacher expecting to submit an
 * assessment for approval, or an admin expecting to see it in their queue.
 *
 * `useSearchParams()` (a deep link from... nowhere yet, but matching the
 * sibling page's own established pattern for forward-compatibility) needs a
 * Suspense boundary for the production prerender to succeed.
 */
export default function TeacherAssessmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssessmentsScreen />
    </Suspense>
  );
}

/** Assessment's own, simpler lifecycle — no REVIEW/APPROVED/REJECTED, since
 *  there is no approval workflow to be in the middle of. */
function assessmentDisplayStatus(
  e: ExamListItem,
): "Draft" | "Scheduled" | "Live" | "Closed" {
  if (e.status === "DRAFT") return "Draft";
  if (e.status === "ARCHIVED") return "Closed";
  const status = examDisplayStatus(e);
  if (status === "SCHEDULED") return "Scheduled";
  return "Live"; // LIVE or PUBLISHED-with-no-window-yet — both mean "open"
}

function AssessmentsScreen() {
  const params = useSearchParams();
  const me = getUserSnapshot();
  const [exams, setExams] = useState<ExamListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [building, setBuilding] = useState(params.get("new") === "1");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [editingExam, setEditingExam] = useState<ExamDetail | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setExams((await listExams({ kind: "ASSESSMENT" })).items);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load assessments");
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

  /** Same reasoning as the Mock Test wizard's edit path — the list row is a
   *  summary, the wizard needs the full paper (sections, questions, batches). */
  async function openForEdit(examId: string) {
    setLoadingEdit(examId);
    setError(null);
    try {
      const detail = await fetchExam(examId);
      setEditingExam(detail);
      setBuilding(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not open that assessment.",
      );
    } finally {
      setLoadingEdit(null);
    }
  }

  return (
    <TeacherShell title="Assessments">
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
              {s === "mine" ? "Mine" : "All assessments"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="ml-auto flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />
          New assessment
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
        title={exams ? `${visible.length} assessments` : "Assessments"}
        subtitle="You create, schedule and publish these directly — no admin review, no live monitoring. Results and the leaderboard publish automatically the moment the window closes."
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
                ? "You have not created an assessment yet."
                : "No assessments in this institute yet."}
            </p>
            <button
              type="button"
              onClick={() => setBuilding(true)}
              className="mt-3 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
            >
              Create an assessment
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((e) => {
              const status = assessmentDisplayStatus(e);
              const canEdit = e.status === "DRAFT";
              const canViewResults = e.status === "ARCHIVED";
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
                        sections · {e.durationMinutes} min · {e._count.batches}{" "}
                        batch{e._count.batches === 1 ? "" : "es"} ·{" "}
                        {formatSchedule(e)}
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
                          status === "Draft"
                            ? "muted"
                            : status === "Closed"
                              ? "muted"
                              : "good"
                        }
                      >
                        {status}
                      </StatusPill>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void openForEdit(e.id)}
                          disabled={loadingEdit === e.id}
                          className="flex items-center gap-1.5 rounded-lg border border-admin-line px-2.5 py-1.5 text-xs font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                        >
                          {loadingEdit === e.id ? "Opening…" : "Edit"}
                        </button>
                      )}
                      {canViewResults && (
                        <Link
                          href={`/teacher/reports?examId=${e.id}`}
                          className="flex items-center gap-1.5 rounded-lg bg-admin px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-95"
                        >
                          View results
                        </Link>
                      )}
                    </div>
                  </div>
                  {status === "Closed" && !e.autoClosedAt && (
                    <p className="mt-2 text-xs text-admin-subtle">
                      Results are being finalized — this usually takes under a
                      minute.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <ExamBuilderDrawer
        mode="assessment"
        // Remounted per target so the wizard re-seeds instead of carrying the
        // previous assessment's sections into the next one.
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
              ? `"${title}" saved.`
              : `"${title}" scheduled — students in the assigned batches can enter once the window opens.`,
          );
          setEditingExam(null);
          void load();
        }}
      />
    </TeacherShell>
  );
}
