"use client";

import { useCallback, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { MonitorDetailDrawer } from "@/components/admin/monitor-detail-drawer";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  RadioIcon,
} from "@/components/admin/icons";
import { useAdminData } from "@/hooks/use-admin-data";
import {
  approveEntry,
  denyEntry,
  fetchEntryRequests,
  fetchExamMonitor,
  type ExamMonitor,
} from "@/lib/admin";
import { examDisplayStatus, listExams } from "@/lib/exams";

interface Session {
  examId: string;
  scope: string;
  name: string;
  attempting: number;
  remaining: string;
  submitted: number;
  progress: number;
  incidents: number;
  monitor: ExamMonitor;
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return `${h}h ago`;
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

/** Live exams + their monitor payloads, plus recently-closed exams. */
function useMonitoring() {
  const loader = useCallback(async () => {
    const exams = await listExams();
    const live = exams.filter((e) => examDisplayStatus(e) === "LIVE");
    /**
     * Recently-concluded exams are fetched in full, not just named.
     *
     * The roster and the incident log used to exist only while an exam was
     * running: the moment the window closed the exam dropped out of this
     * screen and took both with it. That is exactly backwards — during the
     * exam an invigilator is watching the hall, and it is afterwards that
     * anyone asks who was flagged and what they did. Five is enough to cover
     * "the one that just finished" without turning this into a report.
     */
    const closed = exams
      .filter((e) => examDisplayStatus(e) === "COMPLETED")
      .sort((a, b) => (b.endAt ?? "").localeCompare(a.endAt ?? ""))
      .slice(0, 5);

    const load = async (e: (typeof exams)[number]) => {
      try {
        return await fetchExamMonitor(e.id);
      } catch {
        // One unreadable exam must not blank the whole screen.
        return null;
      }
    };
    const [monitors, closedMonitors] = await Promise.all([
      Promise.all(live.map(load)),
      Promise.all(closed.map(load)),
    ]);

    const sessions: Session[] = monitors
      .filter((m): m is ExamMonitor => m !== null)
      .map((m) => ({
        examId: m.examId,
        scope: `${m.totalStudents} assigned`,
        name: m.title,
        attempting: m.counts.inProgress,
        remaining: remainingLabel(m),
        submitted: m.counts.submitted + m.counts.autoSubmitted,
        progress:
          m.totalStudents > 0
            ? Math.round(
                ((m.counts.submitted + m.counts.autoSubmitted) /
                  m.totalStudents) *
                  100,
              )
            : 0,
        incidents: m.students.filter((s) => s.violations > 0 || s.flagged)
          .length,
        monitor: m,
      }));

    return {
      sessions,
      concluded: closed.map((e, i) => {
        const monitor = closedMonitors[i];
        const flagged = monitor
          ? monitor.students.filter((st) => st.violations > 0 || st.flagged)
              .length
          : 0;
        return {
          id: e.id,
          name: e.title,
          meta: `Ended ${relative(e.endAt)} · ${e._count.batches} batch(es)`,
          flagged,
          monitor,
        };
      }),
    };
  }, []);

  /**
   * Poll, because this screen's whole purpose is to be current.
   *
   * It used to fetch once on mount and never again, so an invigilator watching
   * a live hall saw a snapshot from whenever they opened the tab — candidates
   * who started, submitted or picked up violations after that were simply
   * invisible. Ten seconds is frequent enough to act on and cheap enough for a
   * screen that one or two staff have open, and a failed poll keeps the last
   * good data rather than blanking the room.
   */
  return useAdminData(loader, [], { refreshMs: 10_000 });
}

/**
 * Students waiting on (or just decided for) entry into a live exam (§ exam
 * entry approval) — flattened across every live exam into one queue, since
 * an invigilator watching a hall of several concurrent papers needs one
 * place to look, not one per exam.
 */
function useEntryRequests(exams: { id: string; title: string }[]) {
  const examKey = exams.map((e) => e.id).join(",");
  const loader = useCallback(async () => {
    const perExam = await Promise.all(
      exams.map(async (e) => {
        try {
          const rows = await fetchEntryRequests(e.id);
          return rows
            .filter((r) => r.status === "PENDING_APPROVAL")
            .map((request) => ({ examId: e.id, examTitle: e.title, request }));
        } catch {
          // One unreadable exam must not blank the whole queue.
          return [];
        }
      }),
    );
    return perExam.flat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examKey]);

  return useAdminData(loader, [examKey], { refreshMs: 8_000 });
}

function EntryRequestsQueue({
  exams,
}: {
  exams: { id: string; title: string }[];
}) {
  const { data, loading, reload } = useEntryRequests(exams);
  const items = data ?? [];
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async (attemptId: string) => {
    setBusyId(attemptId);
    setError(null);
    try {
      await approveEntry(attemptId);
      reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not approve this request.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const deny = async (attemptId: string) => {
    setBusyId(attemptId);
    setError(null);
    try {
      await denyEntry(attemptId, denyReason.trim() || undefined);
      setDenyingId(null);
      setDenyReason("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deny this request.");
    } finally {
      setBusyId(null);
    }
  };

  if (exams.length === 0) return null;

  return (
    <section>
      <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
        <ClockIcon className="size-5 text-admin" /> Entry Requests
        {items.length > 0 && (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">
            {items.length}
          </span>
        )}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {!loading && items.length === 0 && (
          <p className="rounded-xl border border-dashed border-admin-line bg-white p-4 text-center text-sm text-admin-muted">
            No one is waiting to enter right now.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        )}
        {items.map(({ examTitle, request }) => (
          <div
            key={request.id}
            className="rounded-xl border border-admin-line/60 bg-white p-4"
          >
            <p className="text-sm font-bold text-admin-ink">
              {request.student.user.name}
              <span className="ml-1.5 font-normal text-admin-muted">
                ({request.student.rollNumber})
              </span>
            </p>
            <p className="text-xs text-admin-subtle">{examTitle}</p>
            {denyingId === request.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  autoFocus
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="rounded-lg border border-admin-line px-3 py-1.5 text-sm outline-none focus:border-admin"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void deny(request.id)}
                    className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    Confirm Deny
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDenyingId(null);
                      setDenyReason("");
                    }}
                    className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-muted hover:bg-admin-bg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => void approve(request.id)}
                  className="flex-1 rounded-lg bg-admin px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => setDenyingId(request.id)}
                  className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-muted hover:bg-admin-bg"
                >
                  Deny
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MonitoringPage() {
  const [detailOpen, setDetailOpen] = useState(false);
  /** Whichever exam's roster the drawer is showing — live or concluded. */
  const [active, setActive] = useState<ExamMonitor | null>(null);
  const { data, loading, error, refreshedAt } = useMonitoring();

  const SESSIONS = useMemo(() => data?.sessions ?? [], [data]);
  const CONCLUDED = useMemo(() => data?.concluded ?? [], [data]);

  /** Flatten flagged / violating candidates across live exams into a feed. */
  const INCIDENTS = useMemo(
    () =>
      // Live sessions first, then the exams that have just finished — the feed
      // is about who needs looking at, and an exam ending does not answer that.
      [
        ...SESSIONS,
        ...CONCLUDED.filter((c) => c.monitor).map((c) => ({
          examId: c.id,
          name: c.name,
          monitor: c.monitor!,
          concluded: true,
        })),
      ]
        .flatMap((s) =>
          s.monitor.students
            .filter((st) => st.violations > 0 || st.flagged)
            .slice(0, 6)
            .map((st) => ({
              title: st.flagged
                ? "Attempt flagged for review"
                : `${st.violations} proctoring violation(s)`,
              who: `${st.name}, ${s.name}`,
              ago: relative(st.lastActivityAt),
              action: st.flagged ? "Review Attempt" : "Monitor",
              severe: st.flagged,
              /** The exam this incident belongs to, so the row can open its
               * monitor drawer — the action label used to be inert text. */
              /** The roster to open when this incident is clicked. */
              monitor: s.monitor,
            })),
        )
        .slice(0, 8),
    [SESSIONS, CONCLUDED],
  );

  const totalAttempting = SESSIONS.reduce((n, s) => n + s.attempting, 0);

  return (
    <AdminShell title="Live Monitoring">
      {/*
       * The status strip that used to sit here printed hardcoded infrastructure
       * readings ("API UPTIME: 99.99%", "DB LATENCY: 12MS", "PROCTORING AI:
       * ACTIVE"). They were literals, wired to nothing — they would have kept
       * reporting 99.99% with the database down, which is worse than showing
       * nothing at all during a live exam. Removed rather than faked; a real
       * health strip needs a metrics endpoint that does not exist yet.
       */}
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold text-admin-ink">Live Monitoring</h2>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-admin-line bg-white px-4 py-2 text-sm font-semibold text-admin-ink">
            <span className="size-2 rounded-full bg-admin" />
            {loading
              ? "Loading live sessions…"
              : `${SESSIONS.length} exam(s) live · ${totalAttempting} student(s) currently attempting`}
          </span>
          {/* Say when this was last true. A live screen that cannot show its own
              freshness is indistinguishable from one that has silently stopped
              updating — which is exactly what this page used to do. */}
          {refreshedAt && (
            <span className="ml-3 text-xs text-admin-muted">
              Updated {refreshedAt.toLocaleTimeString("en-IN")} · refreshes
              every 10s
            </span>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          {/* Left */}
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
              <RadioIcon className="size-5 text-admin" /> Active Sessions
            </h3>

            {!loading && SESSIONS.length === 0 && (
              <div className="rounded-2xl border border-dashed border-admin-line bg-white p-8 text-center text-sm text-admin-muted">
                No exams are live right now. Sessions appear here once an exam
                window opens.
              </div>
            )}

            {SESSIONS.map((s) => (
              <div
                key={s.examId}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActive(s.monitor);
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
                <Ring pct={s.progress} />
                <ChevronRightIcon className="size-5 text-admin-muted" />
              </div>
            ))}

            {/* Incident feed */}
            <div className="mt-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
                <AlertTriangleIcon className="size-5 text-danger" /> Incident
                Feed
              </h3>
            </div>
            <div className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
              {INCIDENTS.length === 0 && (
                <p className="p-6 text-center text-sm text-admin-muted">
                  {loading
                    ? "Loading incidents…"
                    : "No proctoring incidents in any live or recently-concluded exam."}
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
                      {it.ago}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setActive(it.monitor);
                          setDetailOpen(true);
                        }}
                        className="ml-1 font-sans font-semibold text-admin-2 underline-offset-2 hover:underline"
                      >
                        {it.action}
                      </button>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-6">
            {/*
             * "Global Network Load" (Bandwidth 42% / Server Capacity 68%) was
             * removed for the same reason as the status strip above: both
             * percentages were hardcoded literals presented as live telemetry.
             */}
            <EntryRequestsQueue
              exams={SESSIONS.map((s) => ({ id: s.examId, title: s.name }))}
            />

            <section>
              <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
                <CheckCircleIcon className="size-5 text-admin" /> Recently
                Concluded
              </h3>
              <div className="mt-3 flex flex-col gap-2">
                {!loading && CONCLUDED.length === 0 && (
                  <p className="rounded-xl border border-dashed border-admin-line bg-white p-4 text-center text-sm text-admin-muted">
                    No exams have concluded yet.
                  </p>
                )}
                {CONCLUDED.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.monitor}
                    onClick={() => {
                      if (!c.monitor) return;
                      setActive(c.monitor);
                      setDetailOpen(true);
                    }}
                    title={
                      c.monitor
                        ? "Open the participant roster"
                        : "Roster unavailable for this exam"
                    }
                    className="flex w-full items-center justify-between rounded-xl border border-admin-line/60 bg-white p-4 text-left enabled:hover:border-admin/50 enabled:hover:bg-admin/5 disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-admin-ink">
                        {c.name}
                      </p>
                      <p className="text-xs text-admin-subtle">{c.meta}</p>
                    </div>
                    {/*
                      A concluded exam is now a real destination: its roster and
                      violations are exactly what gets asked about after the
                      hall empties, and they used to disappear with the window.
                    */}
                    <span className="flex shrink-0 items-center gap-2">
                      {c.flagged > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                          <AlertTriangleIcon className="size-3" />
                          {c.flagged}
                        </span>
                      )}
                      <ChevronRightIcon className="size-5 text-admin-muted" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <MonitorDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        monitor={active ?? undefined}
      />
    </AdminShell>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 44 44" className="size-full -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--color-admin-line)"
          strokeWidth="4"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--color-admin)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-admin">
        {pct}%
      </span>
    </div>
  );
}
