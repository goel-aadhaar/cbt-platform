"use client";

import type { ComponentType, SVGProps } from "react";
import { useMemo, useState, Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminData } from "@/hooks/use-admin-data";
import { listStaff, type StaffRow } from "@/lib/admin";
import {
  AddStaffDrawer,
  StaffDetailsDrawer,
} from "@/components/admin/staff-drawers";
import {
  CalendarIcon,
  ClipboardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UserPlusIcon,
  UsersIcon,
  UserXIcon,
} from "@/components/admin/icons";

const TAB_DEFS: { label: string; status?: StaffRow["status"] }[] = [
  { label: "All Staff" },
  { label: "Invitations", status: "PENDING" },
  { label: "Deactivated", status: "DISABLED" },
];

/**
 * `useSearchParams()` (deep links from the Quick Create menu) forces a client
 * bail-out, which Next requires to sit behind a Suspense boundary or the
 * production prerender of this route fails.
 */
export default function TeachersPage() {
  return (
    <Suspense fallback={null}>
      <TeachersPageInner />
    </Suspense>
  );
}

function TeachersPageInner() {
  const [tab, setTab] = useState(0);
  const params = useSearchParams();
  const [addOpen, setAddOpen] = useState(params.get("new") === "1");
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsStaff, setDetailsStaff] = useState<StaffRow | null>(null);
  /** Which staff role this roster is currently viewing. */
  const [viewRole, setViewRole] = useState<"TEACHER" | "ADMIN">("TEACHER");

  const { data, loading, error } = useAdminData(
    () => listStaff({ role: viewRole, limit: 200 }),
    [viewRole],
  );
  const all = useMemo(() => data?.items ?? [], [data]);

  const counts = useMemo(
    () => ({
      total: data?.total ?? 0,
      pending: all.filter((s) => s.status === "PENDING").length,
      disabled: all.filter((s) => s.status === "DISABLED").length,
      assignments: all.reduce((n, s) => n + s.questionsAuthored, 0),
    }),
    [all, data],
  );

  const TABS = TAB_DEFS.map((t) => ({
    label: t.label,
    count:
      t.status === "PENDING"
        ? counts.pending || null
        : t.status === "DISABLED"
          ? counts.disabled || null
          : null,
  }));

  const wanted = TAB_DEFS[tab]?.status;
  const STAFF = wanted ? all.filter((s) => s.status === wanted) : all;

  return (
    <AdminShell title="Teachers">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {notice && (
          <p
            role="status"
            className="rounded-lg border border-admin/30 bg-admin/5 px-4 py-2.5 text-sm text-admin"
          >
            {notice}
          </p>
        )}
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">
              {viewRole === "ADMIN" ? "Administrators" : "Teachers"}
            </h2>
            <p className="mt-1 text-sm text-admin-muted">
              {loading
                ? "Loading…"
                : viewRole === "ADMIN"
                  ? `${counts.total} administrator(s) in this institute`
                  : `${counts.total} staff member(s) · ${counts.assignments} questions authored`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-admin-line bg-white p-1">
              {(["TEACHER", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setViewRole(r)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    viewRole === r
                      ? "bg-admin/10 text-admin"
                      : "text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  {r === "TEACHER" ? "Teachers" : "Administrators"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
            >
              <UserPlusIcon className="size-4 text-admin-muted" /> Invite Staff
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              <PlusIcon className="size-4" /> Add Staff
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={UsersIcon}
            label="Total Staff"
            value={loading ? "—" : String(counts.total)}
          />
          <StatCard
            icon={ClipboardIcon}
            label="Questions Authored"
            value={loading ? "—" : String(counts.assignments)}
            tone
          />
          <StatCard
            icon={CalendarIcon}
            label="Pending Invitations"
            value={loading ? "—" : String(counts.pending)}
            tone
          />
          <StatCard
            icon={UserXIcon}
            label="Deactivated"
            value={loading ? "—" : String(counts.disabled)}
          />
        </div>

        {/* Panel */}
        <section className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
          <div className="flex flex-wrap gap-6 border-b border-admin-line/60 px-4 pt-2">
            {TABS.map((t, i) => {
              const active = i === tab;
              return (
                <button
                  key={t.label}
                  onClick={() => setTab(i)}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${
                    active
                      ? "border-admin text-admin"
                      : "border-transparent text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  {t.label}
                  {t.count && (
                    <span className="rounded-full bg-admin-surface px-2 py-0.5 text-xs text-admin-muted">
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="relative flex min-w-[240px] flex-1 items-center">
              <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
              <input
                placeholder="Search staff…"
                className="h-10 w-full rounded-lg border border-admin-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
              />
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink hover:bg-admin-bg">
              <FilterIcon className="size-4 text-admin-muted" /> Filter
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink hover:bg-admin-bg">
              <SortIcon className="size-4 text-admin-muted" /> Sort
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-y border-admin-line/60 bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="size-4 accent-admin" />
                  </th>
                  <th className="px-4 py-3">Staff Name</th>
                  <th className="px-4 py-3">Subject(s)</th>
                  <th className="px-4 py-3">Authored</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
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
                      Loading staff…
                    </td>
                  </tr>
                )}
                {!loading && STAFF.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-admin-muted"
                    >
                      {error ?? "No staff in this view."}
                    </td>
                  </tr>
                )}
                {STAFF.map((s) => (
                  <tr
                    key={s.email}
                    onClick={() => setDetailsStaff(s)}
                    className="cursor-pointer hover:bg-admin-bg/40"
                  >
                    <td className="px-4 py-4">
                      <input type="checkbox" className="size-4 accent-admin" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin text-xs font-bold text-white">
                          {initials(s.name)}
                        </span>
                        <div>
                          <p className="font-semibold text-admin-ink">
                            {s.name}
                          </p>
                          <p className="text-xs text-admin-subtle">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {s.subjects.length ? (
                        <div className="flex flex-wrap gap-1">
                          {s.subjects.map((sub) => (
                            <span
                              key={sub}
                              className="rounded-full bg-admin-mint/40 px-2.5 py-1 text-xs font-medium text-admin"
                            >
                              {sub}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-admin-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-admin-muted">
                      {s.questionsAuthored} q · {s.examsAuthored} exams
                    </td>
                    <td className="px-4 py-4 text-admin-ink">
                      {s.roles.includes("ADMIN") ? "Administrator" : "Teacher"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          s.status === "ACTIVE"
                            ? "bg-admin-mint/50 text-admin"
                            : s.status === "PENDING"
                              ? "bg-warn/15 text-warn"
                              : "bg-admin-surface text-admin-muted"
                        }`}
                      >
                        {s.status === "ACTIVE"
                          ? "Active"
                          : s.status === "PENDING"
                            ? "Invited"
                            : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-admin-muted">
                      {s.lastLoginAt
                        ? new Date(s.lastLoginAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
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

          <div className="flex items-center justify-between border-t border-admin-line/60 px-4 py-3">
            <p className="text-sm text-admin-muted">
              Showing {STAFF.length} of {counts.total} staff
            </p>
            <div className="flex items-center gap-1">
              <PageBtn>
                <ChevronLeftIcon className="size-4" />
              </PageBtn>
              <PageNum active>1</PageNum>
              <PageBtn>
                <ChevronRightIcon className="size-4" />
              </PageBtn>
            </div>
          </div>
        </section>
      </div>

      <AddStaffDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onInvited={(staffName, role) => {
          setNotice(
            `Invitation sent to ${staffName} as ${role === "ADMIN" ? "an administrator" : "a teacher"}.`,
          );
          // If we invited into the other role's roster, switch the view so
          // the new invite is actually visible rather than silently absent.
          if (role !== viewRole) setViewRole(role);
        }}
      />
      <StaffDetailsDrawer
        open={detailsStaff !== null}
        staff={detailsStaff}
        onClose={() => setDetailsStaff(null)}
      />
    </AdminShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  badge,
  tone,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  badge?: string;
  tone?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        <span
          className={`flex size-11 items-center justify-center rounded-full ${tone ? "bg-admin/10 text-admin" : "bg-admin-surface text-admin-muted"}`}
        >
          <Icon className="size-5" />
        </span>
        {badge && (
          <span className="rounded-full bg-admin-mint/50 px-2.5 py-1 text-xs font-semibold text-admin">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-admin-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-admin-ink">{value}</p>
    </div>
  );
}

function PageBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex size-8 items-center justify-center rounded-lg border border-admin-line text-admin-muted hover:bg-admin-bg">
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
      className={`flex size-8 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-admin text-white" : "text-admin-muted hover:bg-admin-bg"}`}
    >
      {children}
    </button>
  );
}

function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}
