import { AdminShell } from "@/components/admin/admin-shell";
import { DashboardStats } from "@/components/admin/dashboard-stats";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  PlusIcon,
  UploadIcon,
} from "@/components/admin/icons";

export default function AdminDashboardPage() {
  return (
    <AdminShell title="Dashboard">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <WelcomeCard />
        <DashboardStats />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-6">
            <PerformanceCard />
            <RecentActivityCard />
            <AiSeamCard />
          </div>
          <div className="flex flex-col gap-6">
            <UpcomingExamsCard />
            <SystemStatusCard />
            <RecentImportsCard />
          </div>
        </div>

        <StudentActivityTable />
      </div>
    </AdminShell>
  );
}

/* -------------------------------- Cards -------------------------------- */

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

function WelcomeCard() {
  return (
    <Card className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-xl">
        <h2 className="text-3xl font-bold tracking-tight text-admin-ink">
          Welcome back, Dr. SK Admin
        </h2>
        <p className="mt-2 text-sm leading-6 text-admin-muted">
          Monitor examinations, students, question bank growth, imports, and
          system health from one premium command center.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-admin px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            <PlusIcon className="size-4" />
            Create Exam
          </button>
          <button
            type="button"
            className="rounded-full border border-admin-line bg-white px-6 py-3 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            Import Students
          </button>
        </div>
      </div>

      {/* Readiness */}
      <div className="w-full rounded-2xl bg-admin-bg p-5 lg:w-[320px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">
            Today&apos;s Readiness
          </span>
          <span className="text-xs text-admin-subtle">4 exams scheduled</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-4xl font-extrabold text-admin-ink">96%</span>
          <span className="rounded-full bg-admin-mint/60 px-3 py-1 text-xs font-semibold text-admin">
            System healthy
          </span>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-admin-line/50">
          <div className="h-full w-[96%] rounded-full bg-admin" />
        </div>
      </div>
    </Card>
  );
}

/* --------------------------- Performance chart --------------------------- */

const BARS: { day: string; pct: number; active?: boolean }[] = [
  { day: "MON", pct: 62 },
  { day: "TUE", pct: 45 },
  { day: "WED", pct: 88, active: true },
  { day: "THU", pct: 52 },
  { day: "FRI", pct: 68 },
  { day: "SAT", pct: 74 },
  { day: "SUN", pct: 60 },
];

function PerformanceCard() {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-admin-ink">
            Exam performance overview
          </h3>
          <p className="mt-1 text-sm text-admin-muted">
            Average score trend across published exams
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-admin-line bg-white px-3 py-1.5 text-xs font-semibold text-admin-ink"
        >
          Last 7 days
          <span className="text-admin-muted">▾</span>
        </button>
      </div>

      <div className="mt-8 flex h-[260px] gap-3 sm:gap-6">
        {BARS.map((b) => (
          <div key={b.day} className="flex flex-1 flex-col items-center">
            {/* flex-1 wrapper stretches to the column's full height, giving the
                percentage-height bar something to resolve against. */}
            <div className="relative flex w-full flex-1 items-end justify-center">
              {b.active && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 rounded-md bg-admin-ink px-2 py-1 text-xs font-semibold text-white"
                  style={{ bottom: `calc(${b.pct}% + 8px)` }}
                >
                  {b.pct}%
                </span>
              )}
              <div
                className={`w-full rounded-t-lg ${b.active ? "bg-admin" : "bg-admin-2/40"}`}
                style={{ height: `${b.pct}%` }}
              />
            </div>
            <span className="mt-3 text-xs font-medium text-admin-subtle">
              {b.day}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-admin-line/60 pt-4 text-xs">
        <span className="size-2.5 rounded-full bg-admin" />
        <span className="font-semibold text-admin-muted">AVG SCORE</span>
        <span className="font-semibold text-admin">
          ↑ +8.2% vs previous week
        </span>
      </div>
    </Card>
  );
}

/* ---------------------------- Upcoming exams ---------------------------- */

interface Upcoming {
  name: string;
  meta: string;
  students: string;
  status: "Scheduled" | "Draft" | "Published";
}

const UPCOMING: Upcoming[] = [
  {
    name: "NEET Full Mock 04",
    meta: "Class 12 · 10:00 AM",
    students: "2,400 students",
    status: "Scheduled",
  },
  {
    name: "JEE Physics Sprint",
    meta: "Dropper · 02:00 PM",
    students: "880 students",
    status: "Draft",
  },
  {
    name: "Biology Olympiad",
    meta: "Class 11 · Tomorrow",
    students: "540 students",
    status: "Published",
  },
];

const STATUS_PILL: Record<Upcoming["status"], string> = {
  Scheduled: "bg-admin-mint/50 text-admin",
  Draft: "bg-admin-surface text-admin-muted",
  Published: "bg-admin text-white",
};

function UpcomingExamsCard() {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-admin-ink">Upcoming exams</h3>
        <button className="text-xs font-bold uppercase tracking-wide text-admin-2">
          View full calendar
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {UPCOMING.map((u) => (
          <div
            key={u.name}
            className="rounded-xl border border-admin-line/60 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-admin-ink">{u.name}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[u.status]}`}
              >
                {u.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-admin-muted">
              <span>{u.meta}</span>
              <span>{u.students}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------- System status ---------------------------- */

const SYSTEM: { label: string; value: string; tone?: "ok" }[] = [
  { label: "API uptime", value: "99.98%", tone: "ok" },
  { label: "Auto-save queue", value: "Healthy", tone: "ok" },
  { label: "S3 media", value: "Normal", tone: "ok" },
  { label: "DB latency", value: "42 ms", tone: "ok" },
];

function SystemStatusCard() {
  return (
    <Card>
      <h3 className="text-lg font-bold text-admin-ink">System status</h3>
      <ul className="mt-4 flex flex-col divide-y divide-admin-line/50">
        {SYSTEM.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between py-2.5 text-sm"
          >
            <span className="flex items-center gap-2 text-admin-muted">
              <span className="size-2 rounded-full bg-admin" />
              {s.label}
            </span>
            <span className="font-semibold text-admin-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------- Recent activity ---------------------------- */

const ACTIVITY: { title: string; time: string; subtitle: string }[] = [
  {
    title: "Result published",
    time: "2 min ago",
    subtitle: "NEET Grand Test 03",
  },
  {
    title: "Question approved",
    time: "18 min ago",
    subtitle: "Genetics / Pedigree Analysis",
  },
  {
    title: "Student imported",
    time: "42 min ago",
    subtitle: "WILA-2026-B-MOR-BLR batch",
  },
];

function RecentActivityCard() {
  return (
    <Card>
      <h3 className="text-lg font-bold text-admin-ink">Recent activity</h3>
      <ul className="mt-4 flex flex-col gap-4">
        {ACTIVITY.map((a) => (
          <li key={a.title} className="flex items-start gap-3">
            <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
              <ActivityIcon className="size-4" />
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-admin-ink">
                  {a.title}
                </p>
                <span className="text-xs text-admin-subtle">{a.time}</span>
              </div>
              <p className="text-xs text-admin-muted">{a.subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------- Recent imports ---------------------------- */

function RecentImportsCard() {
  return (
    <Card>
      <h3 className="text-lg font-bold text-admin-ink">Recent imports</h3>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-admin-line/60 p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-admin/10 text-admin">
          <UploadIcon className="size-4" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-admin-ink">
              students_wila.csv
            </p>
            <span className="rounded-full bg-admin-mint/50 px-2 py-0.5 text-[10px] font-bold uppercase text-admin">
              Success
            </span>
          </div>
          <p className="text-xs text-admin-muted">240 rows processed</p>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ AI seam ------------------------------ */

function AiSeamCard() {
  return (
    <Card className="flex items-center gap-4 bg-admin/[0.04]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-admin/10 text-admin">
        <ArrowUpRightIcon className="size-5" />
      </span>
      <div>
        <p className="font-bold text-admin-ink">AI analytics seam is ready</p>
        <p className="text-sm text-admin-muted">
          Insights will appear after analytics module activation based on
          student performance data.
        </p>
      </div>
    </Card>
  );
}

/* ------------------------- Recent student activity ------------------------- */

interface Row {
  name: string;
  task: string;
  status: "Completed" | "Pending";
  score: string;
  date: string;
}

const ROWS: Row[] = [
  {
    name: "Oliver John Brown",
    task: "NEET Grand Test 03",
    status: "Completed",
    score: "680/720",
    date: "2 Dec 2024",
  },
  {
    name: "Noah James Smith",
    task: "JEE Physics Sprint",
    status: "Pending",
    score: "--",
    date: "1 Dec 2024",
  },
];

function StudentActivityTable() {
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <h3 className="text-lg font-bold text-admin-ink">
          Recent Student Activity
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search activity..."
            className="h-9 w-48 rounded-full border border-admin-line bg-white px-4 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
          />
          <button className="flex items-center gap-2 rounded-full border border-admin-line bg-white px-4 py-2 text-xs font-semibold text-admin-ink">
            Sort by <span className="text-admin-muted">▾</span>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-y border-admin-line/60 bg-admin-bg text-xs font-semibold uppercase tracking-wide text-admin-muted">
              <th className="px-6 py-3">Student Name</th>
              <th className="px-6 py-3">Exam / Task</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Score</th>
              <th className="px-6 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-line/50">
            {ROWS.map((r) => (
              <tr key={r.name} className="hover:bg-admin-bg/60">
                <td className="px-6 py-4 font-semibold text-admin-ink">
                  {r.name}
                </td>
                <td className="px-6 py-4 text-admin-muted">{r.task}</td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.status === "Completed"
                        ? "bg-admin-mint/50 text-admin"
                        : "bg-admin-surface text-admin-muted"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-4 font-semibold text-admin-ink">
                  {r.score}
                </td>
                <td className="px-6 py-4 text-admin-muted">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
