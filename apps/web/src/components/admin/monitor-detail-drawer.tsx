"use client";

import { useState } from "react";

import { AlertTriangleIcon, ClipboardIcon, RadioIcon, XIcon } from "./icons";

type Status = "on-track" | "idle" | "flagged";

interface Student {
  name: string;
  initials: string;
  status: Status;
}

const STUDENTS: Student[] = [
  { name: "John Doe", initials: "JD", status: "on-track" },
  { name: "Sarah Adams", initials: "SA", status: "on-track" },
  { name: "Mike Ross", initials: "MR", status: "idle" },
  { name: "Alex Kim", initials: "!", status: "flagged" },
  { name: "Lisa Jin", initials: "LJ", status: "on-track" },
  { name: "Ben Clark", initials: "BC", status: "on-track" },
];

const STAT = [
  { label: "Submitted", value: "45 / 120" },
  { label: "Avg Progress", value: "68%" },
  { label: "Active Incidents", value: "3", danger: true },
];

export function MonitorDetailDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  if (!open) return null;

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
                  NEET Full Mock 04
                </h2>
                <span className="flex items-center gap-1.5 rounded-full bg-admin-mint/50 px-2.5 py-1 text-xs font-bold text-admin">
                  <span className="size-1.5 rounded-full bg-admin" /> LIVE
                </span>
              </div>
              <p className="mt-1 text-sm text-admin-muted">
                Batch 2024-A • Duration: 120 mins • Started: 10:00 AM
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
                badge: 3,
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
          <button className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
            📣 Announce
          </button>
          <button className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
            ❚❚ Pause Exam
          </button>
          <button className="rounded-lg bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95">
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
