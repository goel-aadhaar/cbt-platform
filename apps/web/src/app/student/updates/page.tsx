"use client";

import Link from "next/link";
import { useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BellIcon,
  CalendarIcon,
  FlaskIcon,
  MegaphoneIcon,
} from "@/components/student/icons";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;
type Filter = "all" | "notifications" | "announcements" | "notices";

interface Update {
  kind: Exclude<Filter, "all">;
  title: string;
  body: string;
  time: string;
  cta?: { label: string; href: string };
  icon: IconType;
  tint: string;
  color: string;
  unread?: boolean;
}

const UPDATES: Update[] = [
  {
    kind: "notifications",
    title: "Your NEET Grand Test 04 result is out!",
    body: "Check your detailed analysis and rank.",
    time: "2 hours ago",
    cta: { label: "View Result", href: "/student/reports" },
    icon: BellIcon,
    tint: "#f3e8ff",
    color: "#a855f7",
    unread: true,
  },
  {
    kind: "notices",
    title: "Holiday Notice: Diwali Break",
    body: "The institute will remain closed from Nov 10th to Nov 15th.",
    time: "Yesterday",
    icon: MegaphoneIcon,
    tint: "#dbeafe",
    color: "#3b82f6",
  },
  {
    kind: "announcements",
    title: "Physical Chemistry Workshop",
    body: "Dr. Sharma will be conducting a deep-dive session this Friday.",
    time: "2 days ago",
    icon: FlaskIcon,
    tint: "#fef3c7",
    color: "#f59e0b",
  },
];

const FILTERS: { id: Filter; label: string; badge?: number }[] = [
  { id: "all", label: "All" },
  { id: "notifications", label: "Notifications", badge: 1 },
  { id: "announcements", label: "Announcements" },
  { id: "notices", label: "Institute Notices" },
];

export default function StudentUpdatesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = UPDATES.filter((u) => filter === "all" || u.kind === filter);

  return (
    <StudentShell breadcrumb={["Updates & Announcements"]}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        {/* Feed */}
        <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  filter === f.id
                    ? "bg-admin text-white"
                    : "bg-admin-bg text-admin-muted hover:text-admin-ink"
                }`}
              >
                {f.label}
                {f.badge && (
                  <span
                    className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      filter === f.id
                        ? "bg-white text-admin"
                        : "bg-[#ba1a1a] text-white"
                    }`}
                  >
                    {f.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {visible.map((u) => {
              const Icon = u.icon;
              return (
                <article
                  key={u.title}
                  className={`flex gap-3 rounded-xl p-4 ${
                    u.unread ? "bg-admin/[0.06]" : "hover:bg-admin-bg"
                  }`}
                >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: u.tint, color: u.color }}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-admin-ink">{u.title}</p>
                      <span className="shrink-0 text-xs text-admin-muted">
                        {u.time}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-admin-muted">{u.body}</p>
                    {u.cta && (
                      <Link
                        href={u.cta.href}
                        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-admin hover:underline"
                      >
                        {u.cta.label} <ArrowRightIcon className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
            {visible.length === 0 && (
              <p className="py-8 text-center text-sm text-admin-muted">
                Nothing here yet.
              </p>
            )}
          </div>

          <div className="mt-2 py-2 text-center">
            <button
              type="button"
              className="text-sm font-semibold text-admin hover:underline"
            >
              Load older updates
            </button>
          </div>
        </section>

        {/* Right rail */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
              <CalendarIcon className="size-5 text-admin" />
              Upcoming Exams
            </h2>
            <div className="mt-4 space-y-4">
              <ExamRow
                month="OCT"
                day="28"
                title="Monthly Mock Test"
                sub="Physics"
              />
              <ExamRow
                month="NOV"
                day="05"
                title="Full Syllabus"
                sub="Biology"
              />
            </div>
            <Link
              href="/student/exams"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-admin hover:underline"
            >
              View all exams <ArrowRightIcon className="size-3.5" />
            </Link>
          </section>

          <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
              <CalendarIcon className="size-5 text-admin" />
              This Week&apos;s Classes
            </h2>
            <div className="mt-4 space-y-4">
              <ClassRow
                dot="#006049"
                title="Biology - Genetics"
                sub="Mon, 10:00 AM"
              />
              <ClassRow
                dot="#bdc9c2"
                title="Physics - Optics"
                sub="Tue, 02:00 PM"
              />
            </div>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-admin hover:underline"
            >
              View Full Schedule <ArrowRightIcon className="size-3.5" />
            </button>
          </section>
        </div>
      </div>
    </StudentShell>
  );
}

function ExamRow({
  month,
  day,
  title,
  sub,
}: {
  month: string;
  day: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-admin-bg leading-none">
        <span className="text-[10px] font-semibold uppercase text-admin-muted">
          {month}
        </span>
        <span className="text-lg font-bold text-admin-ink">{day}</span>
      </div>
      <div>
        <p className="font-semibold text-admin-ink">{title}</p>
        <p className="text-sm text-admin-muted">{sub}</p>
      </div>
    </div>
  );
}

function ClassRow({
  dot,
  title,
  sub,
}: {
  dot: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: dot }}
      />
      <div>
        <p className="font-semibold text-admin-ink">{title}</p>
        <p className="text-sm text-admin-muted">{sub}</p>
      </div>
    </div>
  );
}
