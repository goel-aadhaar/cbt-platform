"use client";

import type { ComponentType, SVGProps } from "react";
import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { useAdminData } from "@/hooks/use-admin-data";
import {
  deactivateStaff,
  listBatches,
  listStaff,
  reactivateStaff,
  resendStaffInvite,
  type BatchRow,
  type StaffRow,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";

import { AddStaffDrawer, StaffDetailsDrawer } from "./staff-drawers";
import { RowActionsMenu } from "./row-actions-menu";
import {
  CalendarIcon,
  ClipboardIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UsersIcon,
  UserXIcon,
} from "./icons";

const TAB_DEFS: { label: string; status?: StaffRow["status"] }[] = [
  { label: "All Staff" },
  { label: "Invitations", status: "PENDING" },
  { label: "Deactivated", status: "DISABLED" },
];

/**
 * Shared roster table for both /admin/teachers and /admin/administrators —
 * these used to be one page toggling a `viewRole` state; now `role` is fixed
 * per page, so a teacher and an administrator invite/list/act on distinctly.
 */
type SortKey = "name-asc" | "name-desc" | "role" | "status" | "last-login";

const SORT_LABELS: [SortKey, string][] = [
  ["name-asc", "Name A–Z"],
  ["name-desc", "Name Z–A"],
  ["role", "Role"],
  ["status", "Status"],
  ["last-login", "Last login"],
];

const SORTS: Record<SortKey, (a: StaffRow, b: StaffRow) => number> = {
  "name-asc": (a, b) => a.name.localeCompare(b.name),
  "name-desc": (a, b) => b.name.localeCompare(a.name),
  role: (a, b) => (a.roles?.join() ?? "").localeCompare(b.roles?.join() ?? ""),
  status: (a, b) => a.status.localeCompare(b.status),
  // Never-signed-in sorts last rather than pretending to be the oldest login.
  "last-login": (a, b) =>
    (b.lastLoginAt ? Date.parse(b.lastLoginAt) : -Infinity) -
    (a.lastLoginAt ? Date.parse(a.lastLoginAt) : -Infinity),
};

export function StaffRosterView({ role }: { role: "TEACHER" | "ADMIN" }) {
  const [tab, setTab] = useState(0);
  const params = useSearchParams();
  const [addOpen, setAddOpen] = useState(params.get("new") === "1");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsStaff, setDetailsStaff] = useState<StaffRow | null>(null);
  const [batchId, setBatchId] = useState("");
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // The search box and the Sort button used to be decorative. `listStaff`
  // already accepts `search`, so the box now drives the query; sorting is done
  // over the loaded page, which is what the roster is.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name-asc");

  // Debounced so a typed name is one request, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data,
    loading,
    error: loadError,
  } = useAdminData(
    () =>
      listStaff({
        role,
        batchId: batchId || undefined,
        search: search || undefined,
        limit: 200,
      }),
    [role, batchId, search, refreshTick],
  );
  const all = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (role !== "TEACHER") return;
    let cancelled = false;
    listBatches()
      .then((b) => !cancelled && setBatches(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [role]);

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
  const filtered = wanted ? all.filter((s) => s.status === wanted) : all;
  const STAFF = useMemo(
    () => [...filtered].sort(SORTS[sort]),
    [filtered, sort],
  );
  const label = role === "ADMIN" ? "administrator" : "teacher";

  async function handleDeactivate(row: StaffRow) {
    if (
      !window.confirm(
        `Deactivate ${row.name}? They will no longer be able to sign in.`,
      )
    ) {
      return;
    }
    setRowBusy(row.id);
    setError(null);
    try {
      await deactivateStaff(row.id);
      setNotice(`${row.name} deactivated.`);
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError
          ? e.message
          : `Could not deactivate the ${label}.`,
      );
    } finally {
      setRowBusy(null);
    }
  }

  async function handleReactivate(row: StaffRow) {
    setRowBusy(row.id);
    setError(null);
    try {
      await reactivateStaff(row.id);
      setNotice(`${row.name} reactivated.`);
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError
          ? e.message
          : `Could not reactivate the ${label}.`,
      );
    } finally {
      setRowBusy(null);
    }
  }

  async function handleResendInvite(row: StaffRow) {
    setRowBusy(row.id);
    setError(null);
    try {
      await resendStaffInvite(row.id);
      setNotice(`Invitation email resent to ${row.email}.`);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not resend the invitation.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-admin/30 bg-admin/5 px-4 py-2.5 text-sm text-admin"
        >
          {notice}
        </p>
      )}
      {(error || loadError) && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger"
        >
          {error ?? loadError}
        </p>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-admin-ink">
            {role === "ADMIN" ? "Administrators" : "Teachers"}
          </h2>
          <p className="mt-1 text-sm text-admin-muted">
            {loading
              ? "Loading…"
              : role === "ADMIN"
                ? `${counts.total} administrator(s) in this institute`
                : `${counts.total} staff member(s) · ${counts.assignments} questions authored`}
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />{" "}
          {role === "ADMIN" ? "Add Administrator" : "Add Teacher"}
        </button>
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search staff by name or email…"
              className="h-10 w-full rounded-lg border border-admin-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
            />
          </div>
          {role === "TEACHER" && (
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="h-10 rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin"
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink">
            <SortIcon className="size-4 text-admin-muted" />
            <span className="sr-only">Sort staff by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent text-sm outline-none"
            >
              {SORT_LABELS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-y border-admin-line/60 bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                <th className="px-4 py-3">Staff Name</th>
                {role === "TEACHER" && (
                  <>
                    <th className="px-4 py-3">Subject(s)</th>
                    <th className="px-4 py-3">Batches</th>
                  </>
                )}
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
                    colSpan={role === "TEACHER" ? 9 : 7}
                    className="px-4 py-10 text-center text-admin-muted"
                  >
                    Loading staff…
                  </td>
                </tr>
              )}
              {!loading && STAFF.length === 0 && (
                <tr>
                  <td
                    colSpan={role === "TEACHER" ? 9 : 7}
                    className="px-4 py-10 text-center text-admin-muted"
                  >
                    {loadError ?? "No staff in this view."}
                  </td>
                </tr>
              )}
              {!loading &&
                STAFF.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-admin-bg/40 ${rowBusy === s.id ? "opacity-50" : ""}`}
                  >
                    <td
                      className="cursor-pointer px-4 py-4"
                      onClick={() => setDetailsStaff(s)}
                    >
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
                    {role === "TEACHER" && (
                      <>
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
                        <td className="px-4 py-4">
                          {s.batches.length ? (
                            <div className="flex flex-wrap gap-1">
                              {s.batches.map((b) => (
                                <span
                                  key={b.id}
                                  className="rounded-full bg-admin-surface px-2.5 py-1 text-xs font-medium text-admin-ink"
                                >
                                  {b.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-admin-subtle">
                              Unassigned
                            </span>
                          )}
                        </td>
                      </>
                    )}
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
                      <RowActionsMenu
                        actions={
                          s.status === "DISABLED"
                            ? [
                                {
                                  label: `Reactivate ${label}`,
                                  onClick: () => void handleReactivate(s),
                                  disabled: rowBusy === s.id,
                                },
                              ]
                            : [
                                ...(s.status === "PENDING"
                                  ? [
                                      {
                                        label: "Resend invite email",
                                        onClick: () =>
                                          void handleResendInvite(s),
                                        disabled: rowBusy === s.id,
                                      },
                                    ]
                                  : []),
                                {
                                  label: `Deactivate ${label}`,
                                  onClick: () => void handleDeactivate(s),
                                  danger: true,
                                  disabled: rowBusy === s.id,
                                },
                              ]
                        }
                      />
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
          {/*
            The pager here was a dead "1" between two dead arrows. The endpoint
            returns up to 200 staff in one call and no institute's staff list
            approaches that, so rather than build paging nothing needs, say so
            when the cap is actually reached instead of implying a page 2 that
            never existed.
          */}
          {counts.total > all.length && (
            <p className="text-xs text-admin-muted">
              Showing the first {all.length}. Narrow the list with search.
            </p>
          )}
        </div>
      </section>

      <AddStaffDrawer
        open={addOpen}
        role={role}
        onClose={() => setAddOpen(false)}
        onInvited={(staffName) => {
          setNotice(`Invitation sent to ${staffName}.`);
          setRefreshTick((n) => n + 1);
        }}
      />
      <StaffDetailsDrawer
        key={detailsStaff?.id ?? "none"}
        open={detailsStaff !== null}
        staff={detailsStaff}
        onClose={() => setDetailsStaff(null)}
        onChanged={() => setRefreshTick((n) => n + 1)}
      />
    </div>
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

function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}
