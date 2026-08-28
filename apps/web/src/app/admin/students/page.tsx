"use client";

import type { ComponentType, SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";

import { AddStudentDrawer } from "@/components/admin/add-student-drawer";
import {
  BulkReassignDrawer,
  EditStudentDrawer,
} from "@/components/admin/edit-student-drawer";
import { useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { ImportStudentsModal } from "@/components/admin/import-students-modal";
import { RowActionsMenu } from "@/components/admin/row-actions-menu";
import { StudentHistoryModal } from "@/components/admin/student-history-modal";
import { PaginationBar } from "@/components/pagination-bar";
import { StatCard } from "@/components/staff/charts";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
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
import { useOrgCatalogue } from "@/hooks/use-org-catalogue";
import { ApiError } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { getToken } from "@/lib/auth";
import {
  deactivateStudent,
  listStudents,
  reactivateStudent,
  resendStudentInvite,
  type StudentListItem,
  type StudentQuery,
  type StudentSort,
} from "@/lib/students";

type Status = "Active" | "Pending" | "Deactivated";

const STATUS_LABEL: Record<StudentListItem["status"], Status> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  DISABLED: "Deactivated",
};

/** Roster tab → server-side status filter. Index 0 ("All") sends none. */
const TAB_STATUS: (StudentListItem["status"] | undefined)[] = [
  undefined,
  "ACTIVE",
  "DISABLED",
  "PENDING",
];

/** Roster orderings offered in the Sort control. */
const SORT_OPTIONS: { value: StudentSort; label: string }[] = [
  { value: "roll_asc", label: "Roll number (asc)" },
  { value: "roll_desc", label: "Roll number (desc)" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

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
  const [offset, setOffset] = useState(0);
  const PAGE = 200;
  /** Whole-set status tallies from the API (not counted over the loaded page). */
  const [counts, setCounts] = useState({
    all: 0,
    active: 0,
    disabled: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [batchId, setBatchId] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* Roster query state. Each of these used to be a decorative control. */
  const [searchInput, setSearchInput] = useState("");
  /** Debounced copy of `searchInput` — the value actually sent to the API. */
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [programId, setProgramId] = useState("");
  const [sort, setSort] = useState<StudentSort>("roll_asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The student whose exam record is open; `/students/:id/history` had no
  // caller anywhere in the app before this.
  const [historyFor, setHistoryFor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  /** The student whose profile is being edited in the side drawer. */
  const [editFor, setEditFor] = useState<StudentListItem | null>(null);
  /** Bulk reassign to a single destination batch — opened from the toolbar. */
  const [reassignOpen, setReassignOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const catalogue = useOrgCatalogue();
  const programs = catalogue?.programs ?? [];
  const batches = catalogue?.batches ?? [];
  // Classes narrow to the chosen program, mirroring the org hierarchy —
  // filtered client-side from the shared catalogue rather than a
  // per-selection server fetch (§ duplicate-fetch fix).
  const classes = useMemo(
    () =>
      programId
        ? (catalogue?.classes ?? []).filter((c) => c.programId === programId)
        : (catalogue?.classes ?? []),
    [catalogue, programId],
  );

  // Typing re-queries the server, so debounce rather than firing per keystroke.
  /**
   * Bumped after a write to re-run the query above. This page loads through a
   * bespoke effect rather than useAdminData, so it needs its own handle —
   * previously it called window.location.reload(), which threw away the open
   * drawer and every filter the user had set.
   */
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = () => setRefreshNonce((n) => n + 1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function copyRollNumber(id: string, rollNumber: string) {
    // Reports failure rather than showing a tick regardless: over plain HTTP
    // the modern clipboard API does not exist, and the silent version of this
    // looked like it had worked every time.
    if (await copyText(rollNumber)) {
      setCopiedId(id);
      setTimeout(
        () => setCopiedId((prev) => (prev === id ? null : prev)),
        1500,
      );
    } else {
      setNotice(`Could not copy ${rollNumber} — select it and copy manually.`);
    }
  }

  // Load the live roster once hydrated; bounce to sign-in if unauthenticated.
  useEffect(() => {
    if (!hydrated) return;
    if (!getToken()) {
      router.replace("/login?as=staff");
      return;
    }
    let active = true;
    listStudents({
      limit: PAGE,
      offset,
      batchId: batchId || undefined,
      classId: classId || undefined,
      programId: programId || undefined,
      status: TAB_STATUS[activeTab],
      search: search || undefined,
      sort,
    })
      .then((res) => {
        if (!active) return;
        setRows(res.items);
        setTotal(res.total);
        setCounts(res.counts);
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
  }, [
    hydrated,
    router,
    batchId,
    classId,
    programId,
    activeTab,
    search,
    sort,
    offset,
    refreshNonce,
  ]);

  /**
   * A changed filter invalidates whatever page the operator was on — showing
   * page 3 of a now-different, possibly-shorter result set would just look
   * like the filter silently found nothing. Reset during render (React's
   * documented "adjust state when a prop changes" pattern) rather than in an
   * effect, which would cost an extra render + a flash of the wrong page
   * before the reset lands.
   */
  const filterKey = JSON.stringify([
    batchId,
    classId,
    programId,
    activeTab,
    search,
    sort,
  ]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setOffset(0);
  }

  async function handleDeactivate(row: StudentListItem) {
    if (
      !window.confirm(
        `Delete ${row.name}? This archives them — they can no longer sign in, but their records and results are kept and this can be undone later.`,
      )
    ) {
      return;
    }
    setRowBusy(row.id);
    setError(null);
    try {
      const updated = await deactivateStudent(row.id);
      setRows((prev) =>
        (prev ?? []).map((r) => (r.id === row.id ? updated : r)),
      );
      setNotice(`${row.name} deleted (archived).`);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not delete the student.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  async function handleReactivate(row: StudentListItem) {
    setRowBusy(row.id);
    setError(null);
    try {
      const updated = await reactivateStudent(row.id);
      setRows((prev) =>
        (prev ?? []).map((r) => (r.id === row.id ? updated : r)),
      );
      setNotice(`${row.name} reactivated.`);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not reactivate the student.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  /**
   * Deactivate every checked student.
   *
   * There is no bulk endpoint, so this is a sequential loop over the existing
   * per-student route — sequential rather than Promise.all so a mid-run failure
   * stops cleanly with a partial count reported, instead of firing N parallel
   * writes and leaving the operator guessing which ones landed.
   */
  async function handleBulkDeactivate() {
    const targets = items.filter(
      (r) => selected.has(r.id) && r.status !== "DISABLED",
    );
    if (targets.length === 0) {
      setNotice(
        "Nothing to deactivate — the selected students are already deactivated.",
      );
      return;
    }
    if (
      !window.confirm(
        `Deactivate ${targets.length} student(s)? They can no longer sign in, but their records and results are kept and this can be undone.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    let done = 0;
    try {
      for (const row of targets) {
        const updated = await deactivateStudent(row.id);
        setRows((prev) =>
          (prev ?? []).map((r) => (r.id === row.id ? updated : r)),
        );
        done += 1;
      }
      setNotice(`${done} student(s) deactivated.`);
      setSelected(new Set());
    } catch (e: unknown) {
      setError(
        `${e instanceof ApiError ? e.message : "Bulk deactivation failed."}` +
          ` ${done} of ${targets.length} were deactivated before the failure.`,
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleResendInvite(row: StudentListItem) {
    setRowBusy(row.id);
    setError(null);
    try {
      await resendStudentInvite(row.id);
      setNotice(`Invitation email resent to ${row.email}.`);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not resend the invitation.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  const items = rows ?? [];

  /**
   * Tabs map to a server-side status filter. "Archived Students" and "Student
   * Transfers" were removed: both rendered a hardcoded "0" and neither has a
   * backing concept in the schema — a tab that can only ever say zero is worse
   * than no tab.
   */
  const TABS = [
    { label: "All Students", count: fmt(counts.all) },
    { label: "Active", count: fmt(counts.active) },
    { label: "Deactivated", count: fmt(counts.disabled) },
    { label: "Pending Credentials", count: fmt(counts.pending) },
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
              title={
                selected.size > 0
                  ? `Export the ${selected.size} selected student(s)`
                  : "Export every student matching the current filters"
              }
              onClick={() => {
                void exportRosterCsv(
                  {
                    batchId: batchId || undefined,
                    classId: classId || undefined,
                    programId: programId || undefined,
                    status: TAB_STATUS[activeTab],
                    search: search || undefined,
                    sort,
                  },
                  items.filter((r) => selected.has(r.id)),
                ).catch(() =>
                  setError("Could not build the export. Please try again."),
                );
              }}
            >
              {selected.size > 0
                ? `Export Selected (${selected.size})`
                : "Export Students"}
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
          hint="Live"
          tone="good"
        />
        <StatCard
          icon={UserCheckIcon}
          label="Active Students"
          value={fmt(counts.active)}
          hint="Live"
          tone="good"
        />
        <StatCard
          icon={UserXIcon}
          label="Deactivated Students"
          value={fmt(counts.disabled)}
          hint="Live"
          tone="warn"
        />
        <StatCard
          icon={UserPlusIcon}
          label="Pending Credentials"
          value={fmt(counts.pending)}
          hint="Live"
          tone="good"
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, roll no or email…"
            aria-label="Search students"
            className="h-10 w-full rounded-lg border border-admin-line bg-admin-bg pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
          />
        </div>
        <select
          value={programId}
          onChange={(e) => {
            setLoading(true);
            setProgramId(e.target.value);
            // A class from the old program would contradict the new one.
            setClassId("");
          }}
          aria-label="Filter by program"
          className="h-10 rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={classId}
          onChange={(e) => {
            setLoading(true);
            setClassId(e.target.value);
          }}
          aria-label="Filter by class"
          className="h-10 rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={batchId}
          onChange={(e) => {
            setLoading(true);
            setBatchId(e.target.value);
          }}
          aria-label="Filter by batch"
          className="h-10 rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-admin-muted">
            <SortIcon className="size-4" />
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => {
                setLoading(true);
                setSort(e.target.value as StudentSort);
              }}
              aria-label="Sort students by"
              className="h-10 rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {/* Bulk actions apply to the checkbox selection below. Disabled with
              a reason while nothing is selected, rather than silently inert. */}
          <button
            type="button"
            onClick={() => setReassignOpen(true)}
            disabled={selected.size === 0}
            title={
              selected.size === 0
                ? "Select one or more students first"
                : `Move ${selected.size} selected to another batch`
            }
            className="flex items-center gap-2 rounded-lg border border-admin-line px-3 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move to batch…{selected.size ? ` (${selected.size})` : ""}
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDeactivate()}
            disabled={selected.size === 0 || bulkBusy}
            title={
              selected.size === 0
                ? "Select one or more students first"
                : `Deactivate ${selected.size} selected student(s)`
            }
            className="flex items-center gap-2 rounded-lg border border-admin-line px-3 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkBusy
              ? "Deactivating…"
              : `Deactivate selected${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-admin-line/60 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-admin-line/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-admin"
                  aria-label="Select all students on this page"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(items.map((r) => r.id))
                        : new Set(),
                    )
                  }
                />
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
                <tr
                  key={r.id}
                  className={`hover:bg-admin-bg/50 ${rowBusy === r.id ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      className="size-4 accent-admin"
                      aria-label={`Select ${r.name}`}
                      checked={selected.has(r.id)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                    />
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
                    <button
                      type="button"
                      onClick={() => void copyRollNumber(r.id, r.rollNumber)}
                      title="Copy roll number"
                      className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-admin-bg"
                    >
                      <span className="font-mono text-xs text-admin-ink">
                        {r.rollNumber}
                      </span>
                      {copiedId === r.id ? (
                        <CheckIcon className="size-3.5 text-admin" />
                      ) : (
                        <CopyIcon className="size-3.5 text-admin-subtle" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-admin-ink">{r.batch?.name ?? "—"}</p>
                  </td>
                  <td className="px-4 py-4 text-admin-muted">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-admin-muted">
                    {r.addedBy ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill status={STATUS_LABEL[r.status]} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <RowActionsMenu
                      actions={
                        r.status === "DISABLED"
                          ? [
                              {
                                label: "View exam history",
                                onClick: () =>
                                  setHistoryFor({ id: r.id, name: r.name }),
                              },
                              {
                                label: "Edit profile",
                                onClick: () => setEditFor(r),
                                disabled: rowBusy === r.id,
                              },
                              {
                                label: "Reactivate student",
                                onClick: () => void handleReactivate(r),
                                disabled: rowBusy === r.id,
                              },
                            ]
                          : [
                              {
                                label: "View exam history",
                                onClick: () =>
                                  setHistoryFor({ id: r.id, name: r.name }),
                              },
                              {
                                label: "Edit profile",
                                onClick: () => setEditFor(r),
                                disabled: rowBusy === r.id,
                              },
                              ...(r.status === "PENDING"
                                ? [
                                    {
                                      label: "Resend invite email",
                                      onClick: () => void handleResendInvite(r),
                                      disabled: rowBusy === r.id,
                                    },
                                  ]
                                : []),
                              {
                                label: "Move to another batch…",
                                onClick: () => {
                                  setSelected(new Set([r.id]));
                                  setReassignOpen(true);
                                },
                                disabled: rowBusy === r.id,
                              },
                              {
                                label: "Delete student",
                                onClick: () => void handleDeactivate(r),
                                danger: true,
                                disabled: rowBusy === r.id,
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

      <PaginationBar
        offset={offset}
        pageSize={PAGE}
        total={total}
        onOffsetChange={setOffset}
        itemLabel="students"
      />

      <StudentHistoryModal
        studentId={historyFor?.id ?? null}
        studentName={historyFor?.name}
        onClose={() => setHistoryFor(null)}
      />

      <AddStudentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={(studentName, rollNumber) => {
          setNotice(
            rollNumber
              ? `Invite sent to ${studentName} — roll number ${rollNumber}.`
              : `Invite sent to ${studentName}.`,
          );
          refresh();
        }}
      />
      <ImportStudentsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(s) => {
          setNotice(
            `Imported ${s.imported.length} of ${s.total} students into ${s.batch}.`,
          );
          refresh();
        }}
      />
      <EditStudentDrawer
        key={editFor?.id ?? "none"}
        open={editFor !== null}
        student={editFor}
        onClose={() => setEditFor(null)}
        onChanged={() => {
          refresh();
          setNotice("Student updated.");
        }}
      />
      <BulkReassignDrawer
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        selectedStudents={rows?.filter((r) => selected.has(r.id)) ?? []}
        onChanged={() => {
          refresh();
          setSelected(new Set());
          setNotice("Students moved.");
        }}
      />
    </AdminShell>
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

function toCsv(rows: StudentListItem[]): string {
  const head = "rollNumber,name,email,status,batch,joinedAt";
  const body = rows
    .map((r) =>
      [
        r.rollNumber,
        JSON.stringify(r.name),
        r.email,
        r.status,
        JSON.stringify(r.batch?.name ?? ""),
        new Date(r.createdAt).toISOString().slice(0, 10),
      ].join(","),
    )
    .join("\n");
  return `${head}\n${body}\n`;
}

function download(csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `codonmind-students-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * CSV of the roster. There is no server-side student export endpoint (only exam
 * results have one), so this builds the file client-side — but it exports the
 * WHOLE filtered set, not just the page on screen.
 *
 * The previous version serialised only the ≤200 loaded rows while the button
 * said "Export Students", so an institute with more students silently got a
 * truncated file. Pages through the API instead, and honours a checkbox
 * selection when one exists.
 */
async function exportRosterCsv(
  query: StudentQuery,
  selectedRows: StudentListItem[],
): Promise<void> {
  if (selectedRows.length > 0) {
    download(toCsv(selectedRows));
    return;
  }

  const PAGE = 200;
  const all: StudentListItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await listStudents({ ...query, limit: PAGE, offset });
    all.push(...page.items);
    if (all.length >= page.total || page.items.length === 0) break;
  }
  download(toCsv(all));
}
