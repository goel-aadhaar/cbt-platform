"use client";

import { useMemo, useState } from "react";

import { examDisplayStatus, type ExamListItem } from "@/lib/exams";

import { EXAM_STATUS_DOT, ExamStatusPill } from "./exam-status-pill";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "./icons";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Sunday-first 6x7 grid covering the whole month, plus lead/trail days. */
function buildGrid(viewMonth: Date): Date[] {
  const firstOfMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth(),
    1,
  );
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Month-grid view of scheduled exams, opened from the "Exam Calendar" button
 * (§ admin/exams). Reuses the exam list `admin/exams/page.tsx` already
 * fetched — no separate backend endpoint needed, since every exam's own
 * `startAt`/status is already loaded there.
 */
export function ExamCalendarModal({
  open,
  onClose,
  exams,
  onOpenExam,
}: {
  open: boolean;
  onClose: () => void;
  exams: ExamListItem[];
  onOpenExam: (examId: string) => void;
}) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selected, setSelected] = useState<Date>(today);

  const byDay = useMemo(() => {
    const map = new Map<string, ExamListItem[]>();
    for (const e of exams) {
      if (!e.startAt) continue;
      const key = dayKey(new Date(e.startAt));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [exams]);

  if (!open) return null;

  const grid = buildGrid(viewMonth);
  const selectedExams = (byDay.get(dayKey(selected)) ?? []).sort((a, b) =>
    (a.startAt ?? "").localeCompare(b.startAt ?? ""),
  );

  function shiftMonth(delta: number) {
    setViewMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Calendar */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-admin-line/60">
          <div className="flex items-center justify-between border-b border-admin-line/60 px-6 py-4">
            <h2 className="text-lg font-bold text-admin-ink">
              {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="flex size-8 items-center justify-center rounded-lg text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMonth(
                    new Date(today.getFullYear(), today.getMonth(), 1),
                  );
                  setSelected(today);
                }}
                className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="flex size-8 items-center justify-center rounded-lg text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px border-b border-admin-line/60 bg-admin-line/40 px-px pb-px">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="bg-admin-bg py-2 text-center text-[11px] font-bold uppercase text-admin-muted"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-7 gap-px overflow-auto bg-admin-line/40 px-px pb-px">
            {grid.map((d) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isToday = dayKey(d) === dayKey(today);
              const isSelected = dayKey(d) === dayKey(selected);
              const dayExams = byDay.get(dayKey(d)) ?? [];
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setSelected(d)}
                  className={`flex min-h-20 flex-col items-start gap-1 bg-white p-2 text-left hover:bg-admin-bg/60 ${
                    isSelected ? "ring-2 ring-inset ring-admin" : ""
                  } ${!inMonth ? "opacity-40" : ""}`}
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-admin text-white" : "text-admin-ink"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {dayExams.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        title={e.title}
                        className={`size-1.5 rounded-full ${EXAM_STATUS_DOT[examDisplayStatus(e)]}`}
                      />
                    ))}
                    {dayExams.length > 4 && (
                      <span className="text-[10px] font-semibold text-admin-subtle">
                        +{dayExams.length - 4}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day's exams */}
        <div className="flex w-72 shrink-0 flex-col">
          <div className="flex items-center justify-between border-b border-admin-line/60 px-5 py-4">
            <p className="text-sm font-bold text-admin-ink">
              {selected.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </p>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {selectedExams.length === 0 ? (
              <p className="text-sm text-admin-muted">
                No exams scheduled this day.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {selectedExams.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onOpenExam(e.id)}
                      className="w-full rounded-xl border border-admin-line/60 p-3 text-left hover:border-admin/50 hover:bg-admin/5"
                    >
                      <p className="truncate text-sm font-bold text-admin-ink">
                        {e.title}
                      </p>
                      <p className="mt-0.5 text-xs text-admin-subtle">
                        {e.startAt &&
                          new Date(e.startAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        {" · "}
                        {e.durationMinutes} min
                      </p>
                      <div className="mt-2">
                        <ExamStatusPill status={examDisplayStatus(e)} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
