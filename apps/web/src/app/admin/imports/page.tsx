import { AdminShell } from "@/components/admin/admin-shell";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  FilterIcon,
  InfoIcon,
  LightbulbIcon,
  MoreVerticalIcon,
} from "@/components/admin/icons";

type LogStatus = "SUCCESS" | "FAILED";

interface LogRow {
  file: string;
  rows: string;
  when: string;
  status: LogStatus;
}

const LOGS: LogRow[] = [
  {
    file: "students_wila_batch_2024.csv",
    rows: "240 rows processed",
    when: "Dec 02, 2024 • 04:32 PM",
    status: "SUCCESS",
  },
  {
    file: "neet_biology_qbank_v2.xlsx",
    rows: "0/50 rows processed",
    when: "Dec 02, 2024 • 11:15 AM",
    status: "FAILED",
  },
  {
    file: "semester_1_results_final.csv",
    rows: "1,200 rows processed",
    when: "Dec 01, 2024 • 09:20 PM",
    status: "SUCCESS",
  },
  {
    file: "teacher_profiles_import.csv",
    rows: "42 rows processed",
    when: "Nov 30, 2024 • 02:45 PM",
    status: "SUCCESS",
  },
  {
    file: "mock_test_4_questions.xlsx",
    rows: "100 rows processed",
    when: "Nov 29, 2024 • 10:10 AM",
    status: "SUCCESS",
  },
];

export default function ImportsPage() {
  return (
    <AdminShell title="Imports">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        {/* Hero banner */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-admin-line bg-gradient-to-r from-admin-mint/20 to-white p-6">
          <div>
            <h2 className="text-[28px] font-semibold leading-9 text-admin-ink">
              Track your data imports
            </h2>
            <p className="mt-1 max-w-xl text-admin-muted">
              Monitor student enrollments, exam result uploads, and question
              bank bulk imports from this centralized history panel.
            </p>
          </div>
          <div className="flex items-center gap-8 rounded-xl border border-admin-line/50 bg-white/60 px-6 py-4 backdrop-blur-sm">
            <HeroStat label="Total Imports" value="1,284" />
            <span className="h-10 w-px bg-admin-line" />
            <HeroStat label="Success Rate" value="98.2%" />
          </div>
        </section>

        {/* Import logs panel */}
        <section className="overflow-hidden rounded-2xl border border-admin-line bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between border-b border-admin-line px-6 py-5">
            <div>
              <h3 className="text-lg font-bold text-admin-ink">
                Recent Import Logs
              </h3>
              <p className="text-sm text-admin-muted">
                Showing latest activity from the last 30 days
              </p>
            </div>
            <div className="flex items-center gap-2">
              <IconBtn label="Filter">
                <FilterIcon className="size-4" />
              </IconBtn>
              <IconBtn label="Export">
                <DownloadIcon className="size-4" />
              </IconBtn>
            </div>
          </div>

          <ul className="divide-y divide-admin-line">
            {LOGS.map((l) => {
              const ok = l.status === "SUCCESS";
              return (
                <li key={l.file} className="flex items-center gap-4 px-6 py-5">
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                      ok
                        ? "bg-admin-mint/20 text-admin"
                        : "bg-danger-soft/40 text-danger"
                    }`}
                  >
                    <FileTextIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-admin-ink">
                      {l.file}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-admin-muted">
                      <span>{l.rows}</span>
                      <span className="size-1 rounded-full bg-admin-line" />
                      <span>{l.when}</span>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                      ok ? "bg-admin/10 text-admin" : "bg-danger/10 text-danger"
                    }`}
                  >
                    {l.status}
                  </span>
                  <button className="text-admin-muted hover:text-admin-ink">
                    <MoreVerticalIcon className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between border-t border-admin-line px-4 py-3">
            <p className="text-sm text-admin-muted">
              Showing 1 to 5 of 28 entries
            </p>
            <div className="flex items-center gap-1">
              <PageBtn disabled>
                <ChevronLeftIcon className="size-4" />
              </PageBtn>
              <PageNum active>1</PageNum>
              <PageNum>2</PageNum>
              <PageNum>3</PageNum>
              <span className="px-1 text-admin-muted">...</span>
              <PageNum>6</PageNum>
              <PageBtn>
                <ChevronRightIcon className="size-4" />
              </PageBtn>
            </div>
          </div>
        </section>

        {/* Contextual info cards */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <InfoCard
            icon={<InfoIcon className="size-4" />}
            title="Data Retention"
          >
            Import logs and original files are stored for 180 days before being
            archived. Ensure you download reports if needed for long-term audit
            trails.
          </InfoCard>
          <InfoCard
            icon={<LightbulbIcon className="size-4" />}
            title="Common Failures"
          >
            Most import failures are caused by incorrect date formats or missing
            mandatory columns like Student ID. Check the error log for specific
            details.
          </InfoCard>
          <div className="relative overflow-hidden rounded-2xl bg-admin p-5 text-white shadow-lg">
            <div className="absolute -bottom-4 -right-4 size-24 rounded-full bg-white/10 blur-2xl" />
            <h4 className="font-bold">Automate Imports?</h4>
            <p className="mt-2 text-sm text-admin-mint">
              Connect your existing ERP system via our API to synchronize
              student data automatically every 24 hours.
            </p>
            <button className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-admin">
              Learn more
            </button>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-admin-muted">
        {label}
      </p>
      <p className="mt-1 text-[28px] font-semibold leading-9 text-admin">
        {value}
      </p>
    </div>
  );
}

function IconBtn({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-lg border border-admin-line text-admin-muted hover:bg-admin-bg"
    >
      {children}
    </button>
  );
}

function PageBtn({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-lg border border-admin-line text-admin-muted disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PageNum({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      className={`flex size-8 items-center justify-center rounded-lg text-xs font-bold ${
        active ? "bg-admin text-white" : "text-admin-muted hover:bg-admin-bg"
      }`}
    >
      {children}
    </button>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-admin-line bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
          {icon}
        </span>
        <h4 className="font-bold text-admin-ink">{title}</h4>
      </div>
      <p className="mt-4 text-sm leading-6 text-admin-muted">{children}</p>
    </div>
  );
}
