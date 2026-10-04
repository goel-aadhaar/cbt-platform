"use client";

import { REGISTRATION_NUMBER_LABEL } from "@drsk/shared";
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
  emptySelection,
  pageCheckState,
  plural,
  refreshSelected,
  togglePage,
  toggleRow,
  type Selection,
} from "@/lib/roster-selection";
import {
  deactivateStudent,
  EXPORT_SELECTED_MAX,
  exportStudents,
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
  { value: "roll_asc", label: `${REGISTRATION_NUMBER_LABEL} (asc)` },
  { value: "roll_desc", label: `${REGISTRATION_NUMBER_LABEL} (desc)` },
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
  /**
   * Checked students, kept across pages. Cleared whenever the result set
   * changes (see `resultKey`), so it is always a subset of what the current
   * filters match and an export can never include a student hidden by them.
   */
  const [selected, setSelected] = useState<Selection>(emptySelection);
  const [exporting, setExporting] = useState<"all" | "selected" | null>(null);
  /** "Export with Results": add each student's CBT results to the file. */
  const [withResults, setWithResults] = useState(true);
  // The student whose exam record is open; `/students/:id/history` had no
  // caller anywhere in the app before this.
  const [historyFor, setHistoryFor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  /** The student whose profile is being edited in the side drawer. */
  const [editFor, setEditFor] = useState<StudentListItem | null>(null);
  /**
   * Students the bulk-reassign drawer is moving: the whole selection from the
   * toolbar, or one row from its menu (which no longer overwrites the
   * selection to do so).
   */
  const [reassign, setReassign] = useState<{
    rows: StudentListItem[];
    fromSelection: boolean;
  } | null>(null);
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

  /** Everything that decides WHICH students are listed (not their order). */
  const resultKey = JSON.stringify([
    batchId,
    classId,
    programId,
    activeTab,
    search,
  ]);
  /** The `resultKey` the rows on screen were loaded for. */
  const [rowsKey, setRowsKey] = useState<string | null>(null);

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
        setRowsKey(resultKey);
        setSelected((prev) => refreshSelected(prev, res.items));
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
    resultKey,
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
  // A different result set drops the selection (sorting and paging do not).
  const [prevResultKey, setPrevResultKey] = useState(resultKey);
  if (resultKey !== prevResultKey) {
    setPrevResultKey(resultKey);
    setSelected(emptySelection());
  }

  /** A row a write returned: merged so fields it omits (addedBy) survive. */
  function applyUpdated(updated: StudentListItem) {
    setRows((prev) =>
      (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
    );
    setSelected((prev) => {
      const old = prev.get(updated.id);
      return old ? toggleRow(prev, { ...old, ...updated }, true) : prev;
    });
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
      applyUpdated(await deactivateStudent(row.id));
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
      applyUpdated(await reactivateStudent(row.id));
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
    const targets = [...selected.values()].filter(
      (r) => r.status !== "DISABLED",
    );
    if (targets.length === 0) {
      setNotice(
        "Nothing to deactivate — the selected students are already deactivated.",
      );
      return;
    }
    const skipped = selected.size - targets.length;
    if (
      !window.confirm(
        `Deactivate ${plural(targets.length, "student")}? They can no longer sign in, but their records and results are kept and this can be undone.` +
          (skipped
            ? ` ${plural(skipped, "selected student is", "selected students are")} already deactivated and will be skipped.`
            : ""),
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    let done = 0;
    try {
      for (const row of targets) {
        applyUpdated(await deactivateStudent(row.id));
        done += 1;
      }
      setNotice(`${plural(done, "student")} deactivated.`);
      setSelected(emptySelection());
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
  /** False while the rows on screen still belong to the previous filters. */
  const pageCurrent = rowsKey === resultKey;
  const pageCheck = pageCheckState(selected, items);
  const rosterFilters: Omit<StudentQuery, "limit" | "offset"> = {
    batchId: batchId || undefined,
    classId: classId || undefined,
    programId: programId || undefined,
    status: TAB_STATUS[activeTab],
    search: search || undefined,
    sort,
  };

  /**
   * Both buttons send the current filters to the one server-side export;
   * "selected" adds the checked ids, so the file holds only those students
   * and nothing the filters hide can slip in.
   */
  async function handleExport(mode: "all" | "selected") {
    if (exporting) return;
    if (mode === "selected" && selected.size === 0) {
      setNotice("Select at least one student to export, or use Export All.");
      return;
    }
    if (mode === "selected" && selected.size > EXPORT_SELECTED_MAX) {
      setNotice(
        `Export Selected takes up to ${fmt(EXPORT_SELECTED_MAX)} students at a time (${fmt(selected.size)} are selected). Narrow the selection, or use Export All.`,
      );
      return;
    }
    if (mode === "all" && total === 0) {
      setNotice(
        "No students match the current filters, so there is nothing to export.",
      );
      return;
    }
    setExporting(mode);
    setNotice(null);
    try {
      const sent = mode === "selected" ? selected.size : null;
      const out = await exportStudents({
        ...rosterFilters,
        ...(mode === "selected" && { ids: [...selected.keys()] }),
        includeResults: withResults,
      });
      const students = out.students ?? sent ?? total;
      const results =
        withResults && out.resultRows !== null
          ? ` with ${plural(out.resultRows, "result row")}`
          : withResults
            ? " with their results"
            : "";
      const leftOut =
        sent !== null && out.students !== null && out.students < sent
          ? ` ${plural(sent - out.students, "selected student was", "selected students were")} left out: no longer in this list (removed, or changed so they no longer match the current filters).`
          : "";
      setNotice(
        mode === "all"
          ? `Exported ${plural(students, "student")}${results} (every student matching the current filters).`
          : `Exported ${plural(students, "student")}${results}.${leftOut}`,
      );
    } catch (e: unknown) {
      setError(
        e instanceof ApiError
          ? `Could not build the export: ${e.message}`
          : "Could not build the export. Please try again.",
      );
    } finally {
      setExporting(null);
    }
  }

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
              disabled={exporting !== null}
              title={
                selected.size > 0
                  ? `Export only the ${plural(selected.size, "selected student")}, across all pages`
                  : "Tick students in the list to export only them"
              }
              onClick={() => void handleExport("selected")}
            >
              {exporting === "selected"
                ? "Exporting…"
                : `Export Selected (${fmt(selected.size)})`}
            </OutlineBtn>
            <OutlineBtn
              icon={DownloadIcon}
              disabled={exporting !== null}
              title="Export every student matching the current filters, across all pages"
              onClick={() => void handleExport("all")}
            >
              {exporting === "all"
                ? "Exporting…"
                : `Export All (${fmt(total)})`}
            </OutlineBtn>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <label
              className="flex items-center gap-2 text-sm font-semibold text-admin-ink"
              title="Add each student’s CBT results to the file: one row per exam result, and one row with blank result columns for a student without any"
            >
              <input
                type="checkbox"
                className="size-4 accent-admin"
                checked={withResults}
                disabled={exporting !== null}
                onChange={(e) => setWithResults(e.target.checked)}
              />
              Export with Results
            </label>
            <OutlineBtn
              icon={CheckIcon}
              disabled
              title="Registration numbers are generated automatically during CSV import"
            >
              {REGISTRATION_NUMBER_LABEL} Generator
            </OutlineBtn>
          </div>
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
            placeholder="Search by name, registration number or email…"
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
            onClick={() =>
              setReassign({ rows: [...selected.values()], fromSelection: true })
            }
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

      {selected.size > 0 && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-admin/30 bg-admin/5 px-4 py-2 text-sm text-admin"
        >
          <span className="font-semibold">{fmt(selected.size)} selected</span>
          {pageCheck.onPage < selected.size && (
            <span>· {fmt(pageCheck.onPage)} on this page</span>
          )}
          <button
            type="button"
            onClick={() => setSelected(emptySelection())}
            className="ml-auto font-semibold hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

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
                  title="Select all on this page"
                  ref={(el) => {
                    if (el) el.indeterminate = pageCheck.indeterminate;
                  }}
                  checked={pageCheck.checked}
                  disabled={!pageCurrent || items.length === 0}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelected((prev) => togglePage(prev, items, checked));
                  }}
                />
              </th>
              <th className="px-4 py-3">Student Name</th>
              <th className="px-4 py-3">{REGISTRATION_NUMBER_LABEL}</th>
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
                      disabled={!pageCurrent}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((prev) => toggleRow(prev, r, checked));
                      }}
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
                      title="Copy registration number"
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
                                onClick: () =>
                                  setReassign({
                                    rows: [r],
                                    fromSelection: false,
                                  }),
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
              ? `Invite sent to ${studentName} — registration number ${rollNumber}.`
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
        open={reassign !== null}
        onClose={() => setReassign(null)}
        selectedStudents={reassign?.rows ?? []}
        onChanged={() => {
          refresh();
          if (reassign?.fromSelection) setSelected(emptySelection());
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
