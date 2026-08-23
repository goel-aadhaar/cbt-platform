"use client";

import { useState } from "react";

import type { ExamMonitor } from "@/lib/admin";

import { AlertTriangleIcon, ClipboardIcon, RadioIcon, XIcon } from "./icons";

/**
 * A candidate finished and a candidate who never turned up are opposite
 * situations, and both used to render as "Idle" in the same amber. During a
 * live exam that is the difference between "nothing to do" and "find out where
 * this person is", so they are now separate states.
 *
 * "Stalled" is a candidate whose attempt is open but whose last saved response
 * is older than {@link STALL_AFTER_MS} — the case the invigilator most needs to
 * see, and one the drawer could not previously express at all.
 */
type Status = "on-track" | "stalled" | "submitted" | "absent" | "flagged";

/** How long without a saved response before a live attempt reads as stalled. */
const STALL_AFTER_MS = 3 * 60 * 1000;

const STATUS_LOOK: Record<
  Status,
  { label: string; ring: string; avatar: string }
> = {
  "on-track": {
    label: "Working",
    ring: "border-admin/40",
    avatar: "bg-admin text-white",
  },
  stalled: {
    label: "No activity",
    ring: "border-warn",
    avatar: "bg-warn text-white",
  },
  submitted: {
    label: "Submitted",
    ring: "border-success/50",
    avatar: "bg-success text-white",
  },
  absent: {
    label: "Not started",
    ring: "border-admin-line",
    avatar: "bg-admin-surface text-admin-muted",
  },
  flagged: {
    label: "Flagged",
    ring: "border-danger bg-danger-soft/30",
    avatar: "bg-danger text-white",
  },
};

interface Student {
  id: string;
  name: string;
  rollNumber: string;
  initials: string;
  status: Status;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Live session drawer. Renders the exam's real candidates and counts from a
 * `monitor` payload (GET /exams/:id/monitor) — the admin monitoring page only
 * ever opens this with an already-fetched session, so there is no loading or
 * missing-data state to render here.
 */
export function MonitorDetailDrawer({
  open,
  onClose,
  monitor,
}: {
  open: boolean;
  onClose: () => void;
  monitor?: ExamMonitor;
}) {
  const [tab, setTab] = useState(0);
  if (!open || !monitor) return null;

  // The server's clock, not the browser's: the payload carries `serverTime`,
  // and comparing against it means a candidate does not read as stalled merely
  // because the invigilator's machine has drifted. Same principle the exam
  // timer follows — and pure, unlike `Date.now()` in render.
  const now = new Date(monitor.serverTime).getTime();
  const STUDENTS: Student[] = monitor.students.slice(0, 24).map((s) => {
    const idleFor = s.lastActivityAt
      ? now - new Date(s.lastActivityAt).getTime()
      : Infinity;
    const status: Status = s.flagged
      ? "flagged"
      : s.status === "NOT_STARTED"
        ? "absent"
        : s.status === "IN_PROGRESS"
          ? idleFor > STALL_AFTER_MS
            ? "stalled"
            : "on-track"
          : "submitted";
    return {
      id: s.studentId,
      name: s.name,
      // The identifier an invigilator actually works from. Names repeat in a
      // hall of two hundred; roll numbers are what gets called out and written
      // on an incident report.
      rollNumber: s.rollNumber,
      initials: s.flagged ? "!" : initialsOf(s.name),
      status,
    };
  });

  const submittedCount =
    monitor.counts.submitted + monitor.counts.autoSubmitted;
  const avgProgress =
    monitor.totalQuestions > 0 && monitor.students.length > 0
      ? Math.round(
          (monitor.students.reduce((n, s) => n + s.answered, 0) /
            (monitor.students.length * monitor.totalQuestions)) *
            100,
        )
      : 0;
  const incidents = monitor.students.filter(
    (s) => s.violations > 0 || s.flagged,
  ).length;

  const STAT = [
    {
      label: "Submitted",
      value: `${submittedCount} / ${monitor.totalStudents}`,
    },
    { label: "Avg Progress", value: `${avgProgress}%` },
    {
      label: "Active Incidents",
      value: String(incidents),
      danger: incidents > 0,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl">
        <header className="border-b border-admin-line/60 px-8 pt-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-admin">
                  {monitor.title}
                </h2>
                <span className="flex items-center gap-1.5 rounded-full bg-admin-mint/50 px-2.5 py-1 text-xs font-bold text-admin">
                  <span className="size-1.5 rounded-full bg-admin" />{" "}
                  {monitor.examStatus}
                </span>
              </div>
              <p className="mt-1 text-sm text-admin-muted">
                {[
                  `${monitor.totalStudents} candidates`,
                  monitor.window.startAt
                    ? `Started: ${new Date(monitor.window.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-admin-line/60 rounded-xl border border-admin-line/60">
            {STAT.map((s) => (
              <div key={s.label} className="px-4 py-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-admin-muted">
                  {s.label}
                </p>
                <p
                  className={`mt-1 flex items-center justify-center gap-1 text-lg font-bold ${s.danger ? "text-danger" : "text-admin-ink"}`}
                >
                  {s.danger && <AlertTriangleIcon className="size-4" />}
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-6">
            {[
              { label: "Live Grid", icon: <RadioIcon className="size-4" /> },
              {
                label: "Participants",
                icon: <ClipboardIcon className="size-4" />,
              },
              {
                label: "Incidents",
                icon: <AlertTriangleIcon className="size-4" />,
                badge: incidents,
              },
            ].map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTab(i)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${i === tab ? "border-admin text-admin" : "border-transparent text-admin-muted"}`}
              >
                {t.icon}
                {t.label}
                {t.badge && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          {tab === 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-admin-ink">
                  Real-time Student Status
                </h3>
                <div className="flex items-center gap-4 text-xs text-admin-muted">
                  <Legend color="bg-admin" label="Working" />
                  <Legend color="bg-warn" label="No activity" />
                  <Legend color="bg-success" label="Submitted" />
                  <Legend color="bg-admin-surface" label="Not started" />
                  <Legend color="bg-danger" label="Flagged" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STUDENTS.map((s) => (
                  // Keyed by student, not by name: two candidates called
                  // the same thing would otherwise collide into one card.
                  <StudentCard key={s.id} student={s} />
                ))}
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-admin-muted">
              {tab === 1
                ? "Participant roster will appear here."
                : "Incident log will appear here."}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
          <button
            disabled
            title="No broadcast endpoint yet"
            className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            📣 Announce
          </button>
          <button
            disabled
            title="No pause endpoint yet"
            className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            ❚❚ Pause Exam
          </button>
          <button
            disabled
            title="No force-submit endpoint yet"
            className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            Force Submit All
          </button>
        </footer>
      </div>
    </div>
  );
}

function StudentCard({ student }: { student: Student }) {
  const { ring, avatar, label } = STATUS_LOOK[student.status];
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-4 ${ring}`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-full text-sm font-bold ${avatar}`}
      >
        {student.initials}
      </span>
      <span className="text-center text-sm font-semibold text-admin-ink">
        {student.name}
      </span>
      <span className="[font-family:var(--font-courier-prime)] text-[11px] text-admin-subtle">
        {student.rollNumber}
      </span>
      {/* The state in words, not only in colour — the four non-flagged states
          were previously indistinguishable to anyone reading the grid. */}
      <span className="text-xs text-admin-muted">{label}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} /> {label}
    </span>
  );
}
