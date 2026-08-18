"use client";

import type { ComponentType, SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

import { AddStudentDrawer } from "@/components/admin/add-student-drawer";
import { useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { ImportStudentsModal } from "@/components/admin/import-students-modal";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UploadIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
  UserXIcon,
} from "@/components/admin/icons";
import { useIsHydrated } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { listStudents, type StudentListItem } from "@/lib/students";

type Status = "Active" | "Pending" | "Deactivated";

const STATUS_LABEL: Record<StudentListItem["status"], Status> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  DISABLED: "Deactivated",
};

/**
 * `useSearchParams()` (deep links from the Quick Create menu) forces a client
 * bail-out, which Next requires to sit behind a Suspense boundary or the
 * production prerender of this route fails.
 */
export default function StudentsPage() {
  return (
    <Suspense fallback={null}>
      <StudentsPageInner />
    </Suspense>
  );
}

function StudentsPageInner() {
  const router = useRouter();
  const hydrated = useIsHydrated();

  const params = useSearchParams();
  // Deep links from the top bar's Quick Create menu.
  const [drawerOpen, setDrawerOpen] = useState(params.get("new") === "1");
  const [importOpen, setImportOpen] = useState(params.get("import") === "1");
  const [activeTab, setActiveTab] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const [rows, setRows] = useState<StudentListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the live roster once hydrated; bounce to sign-in if unauthenticated.
  useEffect(() => {
    if (!hydrated) return;
    if (!getToken()) {
      router.replace("/login?as=staff");
      return;
    }
    let active = true;
    listStudents({ limit: 200 })
      .then((res) => {
        if (!active) return;
        setRows(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        // A dead session is announced centrally by apiFetch and explained by
        // SessionLostModal, which does the sign-out and the redirect. Racing
        // it with a silent bounce would replace that explanation with an
        // unexplained trip to the login screen.
        if (err instanceof ApiError && err.status === 401) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load students",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrated, router]);

  const items = rows ?? [];
  const countBy = (s: StudentListItem["status"]) =>
    items.filter((r) => r.status === s).length;

  const TABS = [
    { label: "All Students", count: fmt(total) },
    { label: "Deactivated Students", count: fmt(countBy("DISABLED")) },
    { label: "Archived Students", count: "0" },
    { label: "Student Transfers", count: "0" },
  ];

  return (
    <AdminShell title="Students">
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-admin/30 bg-admin/5 px-4 py-2.5 text-sm text-admin"
        >
          {notice}
        </p>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-admin-muted">Students</p>
          <h2 className="text-3xl font-bold leading-tight text-admin-ink">
            {fmt(total)} total
            <br />
            students
          </h2>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 rounded-full bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              <PlusIcon className="size-4" /> Add Student
            </button>
            <OutlineBtn icon={UploadIcon} onClick={() => setImportOpen(true)}>
              Import Students
            </OutlineBtn>
            <OutlineBtn
              icon={DownloadIcon}
              onClick={() => exportRosterCsv(items)}
            >
              Export Students
            </OutlineBtn>
          </div>
          <OutlineBtn
            icon={CheckIcon}
            disabled
            title="Roll numbers are generated automatically during CSV import"
          >
            Roll Number Generator
          </OutlineBtn>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersIcon}
          label="Total Students"
          value={fmt(total)}
          delta="Live"
        />
        <StatCard
          icon={UserCheckIcon}
          label="Active Students"
          value={fmt(countBy("ACTIVE"))}
          delta="Live"
        />
        <StatCard
          icon={UserXIcon}
          label="Deactivated Students"
          value={fmt(countBy("DISABLED"))}
          delta="Live"
          down
        />
        <StatCard
          icon={UserPlusIcon}
          label="Pending Credentials"
          value={fmt(countBy("PENDING"))}
          delta="Live"
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-6 border-b border-admin-line/60">
        {TABS.map((t, i) => {
          const active = i === activeTab;
          return (
            <button
              key={t.label}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${
                active
                  ? "border-admin text-admin"
                  : "border-transparent text-admin-muted hover:text-admin-ink"
              }`}
            >
              {t.label}
              <span className="rounded-full bg-admin-surface px-2 py-0.5 text-xs text-admin-muted">
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-admin-line/60 bg-white p-3">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
          <input
            placeholder="Search by name, roll no..."
            className="h-10 w-full rounded-lg border border-admin-line bg-admin-bg pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
          />
        </div>
        <FilterBtn>Batch</FilterBtn>
        <FilterBtn>Class</FilterBtn>
        <FilterBtn>Program</FilterBtn>
        <FilterBtn>Status</FilterBtn>
        <div className="ml-auto flex items-center gap-3">
          <button className="flex items-center gap-2 text-sm font-semibold text-admin-muted">
            <SortIcon className="size-4" /> Sort by
          </button>
          <FilterBtn>Bulk Actions</FilterBtn>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-admin-line/60 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-admin-line/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="size-4 accent-admin" />
              </th>
              <th className="px-4 py-3">Student Name</th>
              <th className="px-4 py-3">Roll Number</th>
              <th className="px-4 py-3">Class / Batch</th>
              <th className="px-4 py-3">Date of Joining</th>
              <th className="px-4 py-3">Added By</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-line/50">
            {loading && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-admin-muted"
                >
                  Loading students…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-danger">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-admin-muted"
                >
                  No students yet. Use “Add Student” or “Import Students” to get
                  started.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              items.map((r) => (
                <tr key={r.id} className="hover:bg-admin-bg/50">
                  <td className="px-4 py-4">
                    <input type="checkbox" className="size-4 accent-admin" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin-mint/60 text-xs font-bold text-admin">
                        {initials(r.name)}
                      </span>
                      <div>
                        <p className="font-semibold text-admin-ink">{r.name}</p>
                        <p className="text-xs text-admin-subtle">{r.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-admin-ink">
                        {r.rollNumber}
                      </span>
                      <CopyIcon className="size-3.5 text-admin-subtle" />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-admin-ink">{r.batch?.name ?? "—"}</p>
                  </td>
                  <td className="px-4 py-4 text-admin-muted">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-admin-muted">—</td>
                  <td className="px-4 py-4">
                    <StatusPill status={STATUS_LABEL[r.status]} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button className="text-admin-muted hover:text-admin-ink">
                      <MoreVerticalIcon className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <AddStudentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={(studentName, rollNumber) => {
          setNotice(
            rollNumber
              ? `Invite sent to ${studentName} — roll number ${rollNumber}.`
              : `Invite sent to ${studentName}.`,
          );
          setTimeout(() => window.location.reload(), 900);
        }}
      />
      <ImportStudentsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(s) =>
          setNotice(
            `Imported ${s.imported.length} of ${s.total} students into ${s.batch}.`,
          )
        }
      />
    </AdminShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  down,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  delta: string;
  down?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-full bg-admin-surface text-admin-muted">
          <Icon className="size-5" />
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            down ? "bg-danger-soft text-danger" : "bg-admin-mint/50 text-admin"
          }`}
        >
          {delta}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold text-admin-ink">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    Active: "bg-admin-mint/60 text-admin",
    Pending: "bg-admin/10 text-admin-2",
    Deactivated: "bg-admin-surface text-admin-muted",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${map[status]}`}
    >
      {status}
    </span>
  );
}

function OutlineBtn({
  icon: Icon,
  children,
  onClick,
  disabled,
  title,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-2 rounded-full border border-admin-line bg-white px-5 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="size-4 text-admin-muted" />
      {children}
    </button>
  );
}

function FilterBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink hover:bg-admin-bg">
      {children}
      <ChevronDownIcon className="size-4 text-admin-muted" />
    </button>
  );
}

function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (x: number) => x.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Client-side CSV of the roster currently loaded. There is no server-side
 * student export endpoint (only exam results have one), so this serialises
 * what the table already holds rather than pretending to call an API.
 */
function exportRosterCsv(rows: StudentListItem[]): void {
  const head = "rollNumber,name,email,status,batch,joinedAt";
  const body = rows
    .map((r) =>
      [
        r.rollNumber,
        JSON.stringify(r.name),
        r.email,
        r.status,
        r.batch?.name ?? "",
        new Date(r.createdAt).toISOString().slice(0, 10),
      ].join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([`${head}\n${body}\n`], { type: "text/csv" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `drsk-students-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
