"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  ClipboardIcon,
} from "@/components/admin/icons";
import { useDashboard, type DashboardSummary } from "@/hooks/use-dashboard";
import { getUserSnapshot, subscribeSession } from "@/lib/auth";

/**
 * Admin landing page.
 *
 * Every figure comes from GET /dashboard. Cards the platform has no data for —
 * API uptime, S3 health, "AI insights", an import log — are gone rather than
 * showing invented values; an admin reads this screen as fact.
 */
export default function AdminDashboardPage() {
  const { data, loading, error } = useDashboard();

  return (
    <AdminShell title="Dashboard">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <WelcomeCard data={data} loading={loading} />
        <StatRow data={data} loading={loading} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-6">
            <ActivityCard data={data} loading={loading} />
            <RecentAttemptsTable data={data} loading={loading} />
          </div>
          <UpcomingExamsCard data={data} loading={loading} />
        </div>
      </div>
    </AdminShell>
  );
}

function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse rounded bg-admin-line/40 ${className}`}
    />
  );
}

function WelcomeCard({
  data,
  loading,
}: {
  data: DashboardSummary | null;
  loading: boolean;
}) {
  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );
  const c = data?.counts;

  return (
    <Card className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-xl">
        <h2 className="text-3xl font-bold tracking-tight text-admin-ink">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h2>
        <p className="mt-2 text-sm leading-6 text-admin-muted">
          Monitor examinations, students, the question bank and results from one
          place.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {/* Admins review and approve papers; they don't author them —
              that's a teacher's job, enforced on the backend too. This links
              straight to the approval queue rather than a create flow. */}
          <Link
            href="/admin/exams"
            className="flex items-center gap-2 rounded-full bg-admin px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            <ClipboardIcon className="size-4" />
            Review Exams
          </Link>
          <Link
            href="/admin/students?import=1"
            className="rounded-full border border-admin-line bg-white px-6 py-3 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            Import Students
          </Link>
        </div>
      </div>

      {/* What actually needs the admin's attention right now. */}
      <div className="w-full rounded-2xl bg-admin-bg p-5 lg:w-[320px]">
        <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">
          Needs your attention
        </span>

        {loading || !c ? (
          <div className="mt-3 space-y-2">
            <Shimmer className="h-8 w-24" />
            <Shimmer className="h-4 w-40" />
          </div>
        ) : c.pendingResults === 0 && c.liveExams === 0 ? (
          <p className="mt-3 text-sm text-admin-muted">
            Nothing waiting — no live exams and every submitted attempt has been
            published.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {c.liveExams > 0 && (
              <Link
                href="/admin/monitoring"
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 hover:bg-admin/5"
              >
                <span className="text-sm font-semibold text-admin-ink">
                  {c.liveExams} exam{c.liveExams === 1 ? "" : "s"} live now
                </span>
                <ArrowUpRightIcon className="size-4 text-admin" />
              </Link>
            )}
            {c.pendingResults > 0 && (
              <Link
                href="/admin/results"
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 hover:bg-admin/5"
              >
                <span className="text-sm font-semibold text-admin-ink">
                  {c.pendingResults} result
                  {c.pendingResults === 1 ? "" : "s"} unpublished
                </span>
                <ArrowUpRightIcon className="size-4 text-admin" />
              </Link>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function StatRow({
  data,
  loading,
}: {
  data: DashboardSummary | null;
  loading: boolean;
}) {
  const c = data?.counts;
  const tiles = [
    {
      label: "Students",
      value: c?.students,
      sub: c ? `${c.activeStudents} active` : "",
      href: "/admin/students",
    },
    {
      label: "Question Bank",
      value: c?.questions,
      sub: c ? `${c.approvedQuestions} approved` : "",
      href: "/admin/questions",
    },
    {
      label: "Exams",
      value: c?.exams,
      sub: c ? `${c.liveExams} live now` : "",
      href: "/admin/exams",
    },
    {
      label: "Attempts (7d)",
      value: c?.attemptsThisWeek,
      sub: c ? `${c.submittedThisWeek} submitted` : "",
      href: "/admin/results",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-admin/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
            {t.label}
          </p>
          {loading || t.value === undefined ? (
            <Shimmer className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-extrabold text-admin-ink">
              {t.value}
            </p>
          )}
          <p className="mt-1 text-xs text-admin-muted">
            {loading ? <Shimmer className="h-3 w-20" /> : t.sub}
          </p>
        </Link>
      ))}
    </div>
  );
}

/** Attempt volume over the last 7 days — counted, not styled to look busy. */
function ActivityCard({
  data,
  loading,
}: {
  data: DashboardSummary | null;
  loading: boolean;
}) {
  const days = data?.activity ?? [];
  const peak = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-admin-ink">Attempts this week</h3>
        <span className="flex items-center gap-1.5 text-sm text-admin-muted">
          <ActivityIcon className="size-4" />
          {loading ? "…" : `${total} total`}
        </span>
      </div>

      {loading ? (
        <Shimmer className="mt-6 h-40 w-full" />
      ) : total === 0 ? (
        <p className="mt-6 text-sm text-admin-muted">
          No exam attempts in the last seven days.
        </p>
      ) : (
        <div className="mt-6 flex h-40 items-end gap-3">
          {days.map((d) => {
            const pct = (d.count / peak) * 100;
            const label = new Date(d.date + "T00:00:00").toLocaleDateString(
              "en-IN",
              { weekday: "short" },
            );
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center">
                <span className="mb-1 text-xs font-semibold text-admin-ink">
                  {d.count || ""}
                </span>
                <div
                  className="w-full rounded-t-lg bg-admin/80"
                  style={{ height: `${Math.max(pct, d.count > 0 ? 6 : 2)}%` }}
                  title={`${d.count} attempt${d.count === 1 ? "" : "s"}`}
                />
                <span className="mt-2 text-[10px] font-bold uppercase text-admin-muted">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function UpcomingExamsCard({
  data,
  loading,
}: {
  data: DashboardSummary | null;
  loading: boolean;
}) {
  const items = data?.upcoming ?? [];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-admin-ink">Exams ahead</h3>
        <Link
          href="/admin/exams"
          className="text-sm font-semibold text-admin hover:underline"
        >
          All exams
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-admin-muted">
          Nothing scheduled or waiting to start.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-admin-line/60 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-admin-ink">
                  {e.title}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    e.status === "PUBLISHED"
                      ? "bg-admin-mint/60 text-admin"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {e.status === "PUBLISHED" ? "Scheduled" : "Approved"}
                </span>
              </div>
              <p className="mt-1 text-xs text-admin-muted">
                {e.startAt
                  ? new Date(e.startAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Not scheduled"}{" "}
                · {e.durationMinutes} min · {e.questionCount} questions
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentAttemptsTable({
  data,
  loading,
}: {
  data: DashboardSummary | null;
  loading: boolean;
}) {
  const rows = data?.recentAttempts ?? [];
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <h3 className="text-lg font-bold text-admin-ink">Recent activity</h3>
        <Link
          href="/admin/results"
          className="text-sm font-semibold text-admin hover:underline"
        >
          All results
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3 px-6 pb-6">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-admin-muted">No attempts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-y border-admin-line/60 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Exam</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Score</th>
                <th className="px-6 py-3">Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-admin-line/30 text-sm last:border-b-0"
                >
                  <td className="px-6 py-3">
                    <span className="font-medium text-admin-ink">
                      {r.studentName}
                    </span>
                    <span className="block text-xs text-admin-muted">
                      {r.rollNumber}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-admin-ink">{r.exam.title}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === "IN_PROGRESS"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-admin-mint/60 text-admin"
                      }`}
                    >
                      {r.status.replace("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {r.score ? (
                      <span className="font-bold text-admin-ink">
                        {r.score.totalScore}
                        <span className="font-normal text-admin-muted">
                          /{r.score.maxScore}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-admin-muted">
                        {r.status === "IN_PROGRESS" ? "—" : "unpublished"}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-admin-muted">
                    {new Date(r.startedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
