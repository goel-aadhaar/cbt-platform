"use client";

import type { ComponentType, SVGProps } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  BarChartIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  SortIcon,
  UserCheckIcon,
  UsersIcon,
} from "@/components/admin/icons";
import { useAdminData } from "@/hooks/use-admin-data";
import {
  downloadAttendanceCsv,
  downloadResultsExport,
  fetchExamMonitor,
  listExamResults,
  type ExamMonitor,
  type MonitorStudent,
} from "@/lib/admin";
import { examDisplayStatus, listExams } from "@/lib/exams";

type Eligibility = "ELIGIBLE" | "FLAGGED";
type Attempt = "In Progress" | "COMPLETED" | "NOT STARTED" | "EVALUATING";

type SortKey = "roll" | "name" | "score-desc" | "score-asc";

/**
 * `score` is a display string ("42 / 60", or a dash before evaluation), so
 * sorting by it needs the leading number back. Anything unscored sorts to the
 * bottom either way rather than counting as zero — a candidate who has not
 * been evaluated has not scored nothing, they have no score yet.
 */
function scoreOf(row: Row): number | null {
  const n = Number.parseFloat(row.score);
  return Number.isFinite(n) ? n : null;
}

const SORTS: Record<SortKey, (a: Row, b: Row) => number> = {
  roll: (a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }),
  name: (a, b) => a.name.localeCompare(b.name),
  "score-desc": (a, b) => (scoreOf(b) ?? -Infinity) - (scoreOf(a) ?? -Infinity),
  "score-asc": (a, b) => (scoreOf(a) ?? Infinity) - (scoreOf(b) ?? Infinity),
};

interface Row {
  name: string;
  profile: string;
  roll: string;
  eligibility: Eligibility;
  status: Attempt;
  start: string;
  score: string;
}

function toRow(
  s: MonitorStudent,
  scores: Map<string, { score: number; max: number }>,
): Row {
  // PENDING_APPROVAL/APPROVED/DENIED (§ exam entry approval) all fold into
  // "NOT STARTED" here — this page is about final outcomes, not entry-queue
  // logistics (that lives on the live monitoring screen).
  const status: Attempt =
    s.status === "IN_PROGRESS"
      ? "In Progress"
      : s.status === "NOT_STARTED" ||
          s.status === "PENDING_APPROVAL" ||
          s.status === "APPROVED" ||
          s.status === "DENIED"
        ? "NOT STARTED"
        : scores.has(s.studentId)
          ? "COMPLETED"
          : "EVALUATING";
  const sc = scores.get(s.studentId);
  return {
    name: s.name,
    profile: s.batch ? `Batch ${s.batch.name}` : "Unassigned batch",
    roll: s.rollNumber,
    eligibility: s.flagged ? "FLAGGED" : "ELIGIBLE",
    status,
    start: s.startedAt
      ? new Date(s.startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--",
    score: sc ? `${sc.score} / ${sc.max}` : "-- / --",
  };
}

/** Monitor + results for the exam named in `?examId=`, else the best default. */
function useParticipants(examIdParam: string | null) {
  const loader = useCallback(async () => {
    const exams = await listExams();
    const pick =
      exams.find((e) => e.id === examIdParam) ??
      exams.find((e) => examDisplayStatus(e) === "LIVE") ??
      exams.find((e) => examDisplayStatus(e) === "COMPLETED") ??
      exams[0];
    if (!pick) return null;

    const monitor: ExamMonitor = await fetchExamMonitor(pick.id);
    const scores = new Map<string, { score: number; max: number }>();
    try {
      for (const r of await listExamResults(pick.id)) {
        // Results are keyed by roll number; map back via the monitor rows.
        const match = monitor.students.find(
          (s) => s.rollNumber === r.student.rollNumber,
        );
        if (match)
          scores.set(match.studentId, { score: r.totalScore, max: r.maxScore });
      }
    } catch {
      // Not evaluated yet — leave scores empty.
    }
    return { exam: pick, monitor, scores };
  }, [examIdParam]);

  return useAdminData(loader, [examIdParam]);
}

export default function ParticipantsPage() {
  return (
    <Suspense fallback={null}>
      <ParticipantsInner />
    </Suspense>
  );
}

function ParticipantsInner() {
  const [tab, setTab] = useState(0);
  const [sort, setSort] = useState<SortKey>("roll");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const params = useSearchParams();
  const { data, loading, error } = useParticipants(params.get("examId"));

  const monitor = data?.monitor ?? null;
  const rows = useMemo(
    () =>
      monitor
        ? monitor.students.map((s) => toRow(s, data!.scores))
        : ([] as Row[]),
    [monitor, data],
  );

  const TABS = useMemo(() => {
    const c = monitor?.counts;
    return [
      `All Students (${monitor?.totalStudents ?? 0})`,
      `In Progress (${c?.inProgress ?? 0})`,
      `Completed (${(c?.submitted ?? 0) + (c?.autoSubmitted ?? 0)})`,
      `Not Started (${c?.notStarted ?? 0})`,
    ];
  }, [monitor]);

  const visible = useMemo(() => {
    const byTab =
      tab === 1
        ? rows.filter((r) => r.status === "In Progress")
        : tab === 2
          ? rows.filter(
              (r) => r.status === "COMPLETED" || r.status === "EVALUATING",
            )
          : tab === 3
            ? rows.filter((r) => r.status === "NOT STARTED")
            : rows;
    return [...byTab].sort(SORTS[sort]);
  }, [rows, tab, sort]);

  // Matches toRow()'s classification: PENDING_APPROVAL/APPROVED/DENIED
  // (§ exam entry approval) count as "NOT STARTED" here too, not as
  // checked in — no clock has run for any of them.
  const checkedIn = monitor
    ? rows.filter((r) => r.status !== "NOT STARTED").length
    : 0;
  const submissions = monitor
    ? monitor.counts.submitted + monitor.counts.autoSubmitted
    : 0;
  const avgProgress =
    monitor && monitor.totalQuestions > 0 && monitor.students.length > 0
      ? Math.round(
          (monitor.students.reduce((n, s) => n + s.answered, 0) /
            (monitor.students.length * monitor.totalQuestions)) *
            100,
        )
      : 0;

  return (
    <AdminShell title="Exams">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {exportError && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger"
          >
            {exportError}
          </p>
        )}
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Exams / {data?.exam.title ?? "—"}
            </p>
            <h2 className="mt-1 text-3xl font-bold text-admin-ink">
              Participants &amp; Attempts
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-admin-muted">
              <CalendarIcon className="size-4" />
              {loading
                ? "Loading…"
                : monitor
                  ? `${monitor.window.startAt ? new Date(monitor.window.startAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not scheduled"} • ${monitor.totalStudents} students enrolled`
                  : "No exam selected"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={!data?.exam || exporting}
              onClick={async () => {
                if (!data?.exam) return;
                setExporting(true);
                setExportError(null);
                try {
                  await downloadResultsExport(
                    data.exam.id,
                    "csv",
                    `${data.exam.title}-results.csv`,
                  );
                } catch (e) {
                  setExportError(
                    e instanceof Error ? e.message : "Export failed",
                  );
                } finally {
                  setExporting(false);
                }
              }}
              className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadIcon className="size-4 text-admin-muted" />
              {exporting ? "Exporting…" : "Export Results"}
            </button>
            {/*
              Attendance is a different report from results and was missing
              entirely: the results sheet omits everyone who never started,
              which is exactly the list an institute needs to follow up.
            */}
            <button
              disabled={!data?.exam || exporting}
              onClick={async () => {
                if (!data?.exam) return;
                setExporting(true);
                setExportError(null);
                try {
                  await downloadAttendanceCsv(
                    data.exam.id,
                    `${data.exam.title}-attendance.csv`,
                  );
                } catch (e) {
                  setExportError(
                    e instanceof Error ? e.message : "Export failed",
                  );
                } finally {
                  setExporting(false);
                }
              }}
              className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadIcon className="size-4 text-admin-muted" />
              {exporting ? "Exporting…" : "Export Attendance"}
            </button>
            <button
              disabled
              title="Batch assignment happens in the exam wizard; per-student enrolment has no endpoint yet"
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UsersIcon className="size-4" /> Bulk Enroll
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={UserCheckIcon}
            label="Checked In"
            value={loading ? "—" : String(checkedIn)}
            sub={
              monitor && monitor.totalStudents > 0
                ? `${Math.round((checkedIn / monitor.totalStudents) * 100)}% Attendance`
                : "—"
            }
          />
          <Stat
            icon={ClockIcon}
            label="Active Now"
            value={loading ? "—" : String(monitor?.counts.inProgress ?? 0)}
            sub="Real-time"
            subTone="live"
          />
          <Stat
            icon={CheckCircleIcon}
            label="Submissions"
            value={loading ? "—" : String(submissions)}
            sub={
              monitor && monitor.totalStudents > 0
                ? `${Math.round((submissions / monitor.totalStudents) * 100)}% of total`
                : "—"
            }
          />
          <Stat
            icon={BarChartIcon}
            label="Avg. Progress"
            value={loading ? "—" : `${avgProgress}%`}
            progress={avgProgress}
          />
        </div>

        {/* Table panel */}
        <section className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line/60 px-4 py-3">
            <div className="flex flex-wrap gap-4">
              {TABS.map((t, i) => {
                const active = i === tab;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(i)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      active
                        ? "bg-admin/10 text-admin"
                        : "text-admin-muted hover:text-admin-ink"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              {/*
                A "Filter: Eligibility" button used to sit beside this. There is
                no eligibility concept on a participant — assignment is by batch
                and is already reflected in this list — so it could never have
                filtered anything. Removed rather than wired to an invention.
              */}
              <label className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink">
                <SortIcon className="size-4 text-admin-muted" />
                <span className="sr-only">Sort participants by</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="bg-transparent text-sm outline-none"
                >
                  <option value="roll">Roll number</option>
                  <option value="name">Name</option>
                  <option value="score-desc">Score, highest first</option>
                  <option value="score-asc">Score, lowest first</option>
                </select>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-line/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="size-4 accent-admin" />
                  </th>
                  <th className="px-4 py-3">Name &amp; Profile</th>
                  <th className="px-4 py-3">Roll Number</th>
                  <th className="px-4 py-3">Eligibility</th>
                  <th className="px-4 py-3">Attempt Status</th>
                  <th className="px-4 py-3">Start Time</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-admin-muted"
                    >
                      Loading participants…
                    </td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-admin-muted"
                    >
                      {error ?? "No participants for this exam."}
                    </td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr
                    key={r.roll}
                    className={`hover:bg-admin-bg/50 ${r.eligibility === "FLAGGED" ? "bg-danger-soft/20" : ""}`}
                  >
                    <td className="px-4 py-4">
                      <input type="checkbox" className="size-4 accent-admin" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin-mint/50 text-xs font-bold text-admin">
                          {initials(r.name)}
                        </span>
                        <div>
                          <p className="font-bold text-admin-ink">{r.name}</p>
                          <p className="text-xs text-admin-subtle">
                            {r.profile}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-admin-ink">
                      {r.roll}
                    </td>
                    <td className="px-4 py-4">
                      <EligibilityPill v={r.eligibility} />
                    </td>
                    <td className="px-4 py-4">
                      <AttemptPill v={r.status} />
                    </td>
                    <td className="px-4 py-4 text-admin-muted">{r.start}</td>
                    <td className="px-4 py-4 font-semibold text-admin-ink">
                      {r.score}
                    </td>
                    {/*
                      A kebab button used to sit here with no menu behind it.
                      Everything a participant row can actually do — export,
                      publish, hold — is an exam-level action and already lives
                      in the header, so there is nothing for a row menu to hold.
                    */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/*
        A floating "+" button used to sit here. Participants are not added on
        this screen — they are whoever is in the batches the exam is assigned
        to — so it had nothing to open, and no handler.
      */}
    </AdminShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  subTone,
  progress,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  sub?: string;
  subTone?: "live";
  progress?: number;
}) {
  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
            {label}
          </p>
          <p className="mt-1 text-3xl font-bold text-admin-ink">{value}</p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
          <Icon className="size-5" />
        </span>
      </div>
      {progress !== undefined ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-admin-line/50">
          <div
            className="h-full rounded-full bg-admin"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${subTone === "live" ? "text-admin" : "text-admin-muted"}`}
        >
          {subTone === "live" && (
            <span className="size-1.5 rounded-full bg-admin" />
          )}
          {sub}
        </p>
      )}
    </section>
  );
}

function EligibilityPill({ v }: { v: Eligibility }) {
  return v === "ELIGIBLE" ? (
    <span className="rounded-full bg-admin-mint/50 px-3 py-1 text-xs font-bold text-admin">
      ELIGIBLE
    </span>
  ) : (
    <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-bold text-danger">
      FLAGGED
    </span>
  );
}

function AttemptPill({ v }: { v: Attempt }) {
  if (v === "In Progress")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-admin">
        <span className="size-1.5 rounded-full bg-admin" /> In Progress
      </span>
    );
  if (v === "COMPLETED")
    return (
      <span className="rounded-full bg-admin-mint/50 px-3 py-1 text-xs font-bold text-admin">
        COMPLETED
      </span>
    );
  if (v === "EVALUATING")
    return (
      <span className="rounded-full bg-[#fff3e0] px-3 py-1 text-xs font-bold text-[#c77700]">
        EVALUATING
      </span>
    );
  return (
    <span className="rounded-full bg-admin-surface px-3 py-1 text-xs font-bold text-admin-muted">
      NOT STARTED
    </span>
  );
}

function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}
