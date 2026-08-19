"use client";

import { useCallback, useMemo, useState } from "react";

import { MonitorDetailDrawer } from "@/components/admin/monitor-detail-drawer";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  ClockIcon,
  RadioIcon,
} from "@/components/admin/icons";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { useAdminData } from "@/hooks/use-admin-data";
import { fetchExamMonitor, type ExamMonitor } from "@/lib/admin";
import { examDisplayStatus, listExams } from "@/lib/exams";

interface Session {
  examId: string;
  scope: string;
  name: string;
  attempting: number;
  remaining: string;
  submitted: number;
  incidents: number;
  monitor: ExamMonitor;
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function remainingLabel(m: ExamMonitor): string {
  const live = m.students.filter(
    (s) => s.status === "IN_PROGRESS" && s.remainingSeconds != null,
  );
  if (live.length === 0) {
    if (!m.window.endAt) return "no window";
    const left = Math.round((Date.parse(m.window.endAt) - Date.now()) / 60000);
    return left > 0 ? `~${left}m of window left` : "window closed";
  }
  const max = Math.max(...live.map((s) => s.remainingSeconds ?? 0));
  return `~${Math.round(max / 60)}m remaining`;
}

/**
 * Live exams the teacher may see (scoped server-side to their assigned
 * batches, or exams they authored — same visibility rule as everything else
 * in the teacher console) plus a monitor payload for each.
 */
function useMonitoring() {
  const loader = useCallback(async () => {
    const exams = await listExams();
    const live = exams.filter((e) => examDisplayStatus(e) === "LIVE");

    const monitors = await Promise.all(
      live.map(async (e) => {
        try {
          return await fetchExamMonitor(e.id);
        } catch {
          return null;
        }
      }),
    );

    const sessions: Session[] = monitors
      .filter((m): m is ExamMonitor => m !== null)
      .map((m) => ({
        examId: m.examId,
        scope: `${m.totalStudents} of your students`,
        name: m.title,
        attempting: m.counts.inProgress,
        remaining: remainingLabel(m),
        submitted: m.counts.submitted + m.counts.autoSubmitted,
        incidents: m.students.filter((s) => s.violations > 0 || s.flagged)
          .length,
        monitor: m,
      }));

    return { sessions };
  }, []);

  return useAdminData(loader, []);
}

export default function TeacherMonitoringPage() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [active, setActive] = useState<Session | null>(null);
  const { data, loading, error } = useMonitoring();

  const SESSIONS = useMemo(() => data?.sessions ?? [], [data]);
  const INCIDENTS = useMemo(
    () =>
      SESSIONS.flatMap((s) =>
        s.monitor.students
          .filter((st) => st.violations > 0 || st.flagged)
          .slice(0, 6)
          .map((st) => ({
            title: st.flagged
              ? "Attempt flagged for review"
              : `${st.violations} proctoring violation(s)`,
            who: `${st.name}, ${s.name}`,
            ago: relative(st.lastActivityAt),
            severe: st.flagged,
          })),
      ).slice(0, 8),
    [SESSIONS],
  );

  const totalAttempting = SESSIONS.reduce((n, s) => n + s.attempting, 0);

  return (
    <TeacherShell title="Live Monitoring">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <div>
          <h2 className="text-3xl font-bold text-admin-ink">Live Monitoring</h2>
          <p className="mt-1 text-sm text-admin-muted">
            Your assigned batches only — not the whole institute.
          </p>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-admin-line bg-white px-4 py-2 text-sm font-semibold text-admin-ink">
            <span className="size-2 rounded-full bg-admin" />
            {loading
              ? "Loading live sessions…"
              : `${SESSIONS.length} exam(s) live · ${totalAttempting} student(s) currently attempting`}
          </span>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
            <RadioIcon className="size-5 text-admin" /> Active Sessions
          </h3>

          {!loading && SESSIONS.length === 0 && (
            <div className="rounded-2xl border border-dashed border-admin-line bg-white p-8 text-center text-sm text-admin-muted">
              No exams are live right now for your assigned batches.
            </div>
          )}

          {SESSIONS.map((s) => (
            <div
              key={s.examId}
              role="button"
              tabIndex={0}
              onClick={() => {
                setActive(s);
                setDetailOpen(true);
              }}
              className="flex cursor-pointer items-center gap-4 rounded-2xl border border-admin-line/60 border-l-4 border-l-admin bg-white p-5 hover:bg-admin-bg/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-admin-surface px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-admin-muted">
                    {s.scope}
                  </span>
                  {s.incidents > 0 && (
                    <span className="flex items-center gap-1 rounded bg-danger/10 px-2 py-0.5 text-[11px] font-bold uppercase text-danger">
                      <AlertTriangleIcon className="size-3" /> {s.incidents}{" "}
                      Incidents
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-lg font-bold text-admin-ink">
                  {s.name}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-admin-muted">
                  <span className="flex items-center gap-1.5 font-semibold text-admin-ink">
                    <span className="size-1.5 rounded-full bg-admin" />{" "}
                    {s.attempting} attempting now
                  </span>
                  <span className="text-admin-line">·</span>
                  <span className="flex items-center gap-1">
                    <ClockIcon className="size-3.5" /> {s.remaining}
                  </span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-admin-ink">
                  {s.submitted}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
                  Submitted
                </p>
              </div>
              <ChevronRightIcon className="size-5 text-admin-muted" />
            </div>
          ))}

          <div className="mt-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
              <AlertTriangleIcon className="size-5 text-danger" /> Live Incident
              Feed
            </h3>
          </div>
          <div className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
            {INCIDENTS.length === 0 && (
              <p className="p-6 text-center text-sm text-admin-muted">
                {loading
                  ? "Loading incidents…"
                  : "No proctoring incidents reported in your live sessions."}
              </p>
            )}
            {INCIDENTS.map((it, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-4 ${i > 0 ? "border-t border-admin-line/50" : ""}`}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${it.severe ? "bg-danger" : "bg-warn"}`}
                />
                <div>
                  <p className="text-sm">
                    <span
                      className={`font-bold ${it.severe ? "text-danger" : "text-admin-ink"}`}
                    >
                      {it.title}
                    </span>
                    <span className="text-admin-ink"> — {it.who}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-admin-subtle">
                    {it.ago}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MonitorDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        monitor={active?.monitor}
      />
    </TeacherShell>
  );
}
