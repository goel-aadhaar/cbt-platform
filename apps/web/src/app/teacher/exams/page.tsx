"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PlusIcon } from "@/components/admin/icons";
import { ExamBuilderDrawer } from "@/components/admin/exam-builder-drawer";
import { Panel, StatusPill } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
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

  const load = useCallback(async () => {
    try {
      setExams(await listExams());
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
                  </div>

                  {/* The approval trail: who has it, and what came back. */}
                  {e.status === "REVIEW" && e.reviewer && (
                    <p className="mt-2 text-xs font-semibold text-admin-muted">
                      With {e.reviewer.name} for approval
                    </p>
                  )}
                  {e.rejectionReason && e.status === "DRAFT" && (
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
        open={building}
        onClose={() => setBuilding(false)}
        onCreated={(_id, title) => {
          setNotice(`"${title}" sent for approval.`);
          void load();
        }}
      />
    </TeacherShell>
  );
}
