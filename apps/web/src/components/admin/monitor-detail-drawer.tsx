"use client";

import { useState } from "react";

import type { ExamMonitor } from "@/lib/admin";

import { AlertTriangleIcon, ClipboardIcon, RadioIcon, XIcon } from "./icons";

type Status = "on-track" | "idle" | "flagged";

interface Student {
  name: string;
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

  const STUDENTS: Student[] = monitor.students.slice(0, 24).map((s) => ({
    name: s.name,
    initials: s.flagged ? "!" : initialsOf(s.name),
    status: s.flagged
      ? "flagged"
      : s.status === "IN_PROGRESS"
        ? "on-track"
        : "idle",
  }));

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
                  <Legend color="bg-admin" label="On Track" />
                  <Legend color="bg-warn" label="Idle" />
                  <Legend color="bg-danger" label="Flagged" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STUDENTS.map((s) => (
                  <StudentCard key={s.name} student={s} />
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
  const ring =
    student.status === "flagged"
      ? "border-danger bg-danger-soft/30"
      : student.status === "idle"
        ? "border-warn"
        : "border-admin/40";
  const avatar =
    student.status === "flagged"
      ? "bg-danger text-white"
      : student.status === "idle"
        ? "bg-admin-surface text-admin-muted"
        : "bg-admin text-white";
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-4 ${ring}`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-full text-sm font-bold ${avatar}`}
      >
        {student.initials}
      </span>
      <span className="text-sm font-semibold text-admin-ink">
        {student.name}
      </span>
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
