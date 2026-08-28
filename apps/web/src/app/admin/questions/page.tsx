"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PaginationBar } from "@/components/pagination-bar";
import { StatCard } from "@/components/staff/charts";
import { QuestionAuthorDrawer } from "@/components/admin/question-author-drawer";
import { QuestionDetailDrawer } from "@/components/admin/question-detail-drawer";
import {
  QuestionExportModal,
  QuestionImportModal,
} from "@/components/admin/question-modals";
import {
  AlignLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DatabaseIcon,
  DownloadIcon,
  FlagIcon,
  LayersIcon,
  MoreVerticalIcon,
  PlusIcon,
  SlidersIcon,
  TargetIcon,
  UploadIcon,
} from "@/components/admin/icons";
import { useAdminData } from "@/hooks/use-admin-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { QuestionFilterBar } from "@/components/admin/question-filters";
import { addToPracticeLibrary, removeFromPracticeLibrary } from "@/lib/admin";
import {
  listQuestions,
  type QuestionFilters,
  type QuestionListItem,
  type QuestionStatus,
  type QuestionDetail,
} from "@/lib/questions";

const STATUS_LABEL: Record<QuestionStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected Draft",
  ARCHIVED: "Archived",
};

// Tab → API status filter (null = all). "Rejected" has no backend equivalent.
const TABS: { label: string; status: QuestionStatus | null }[] = [
  { label: "All", status: null },
  { label: "Draft", status: "DRAFT" },
  { label: "In Review", status: "REVIEW" },
  { label: "Approved", status: "APPROVED" },
  { label: "Archived", status: "ARCHIVED" },
];

export default function QuestionBankPage() {
  const [tab, setTab] = useState(0);
  const [onlyMine, setOnlyMine] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  // The question the author drawer is editing; null means it is creating.
  const [editingQuestion, setEditingQuestion] = useState<QuestionDetail | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<QuestionFilters>({});
  /**
   * Only the typed term is debounced. The dropdown filters resolve in a single
   * change, so delaying those would be lag with nothing to gain; the search box
   * is the one that used to fire a request per keystroke.
   */
  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const active = TABS[tab].status;
  const query = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
      status: active ?? undefined,
      mine: onlyMine || undefined,
    }),
    [filters, debouncedSearch, active, onlyMine],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const PAGE = 50;

  /**
   * A changed filter (or tab, or the "only mine" toggle) invalidates whatever
   * page the operator was on — showing page 3 of a now-different result set
   * would just look like the filter silently found nothing. Reset during
   * render (React's documented "adjust state when a prop changes" pattern)
   * rather than in an effect, which would cost an extra render + a flash of
   * the wrong page before the reset lands.
   */
  const queryKey = JSON.stringify(query);
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey);
  if (queryKey !== prevQueryKey) {
    setPrevQueryKey(queryKey);
    setOffset(0);
  }

  /** Curate (or un-curate) a question for the student practice library. */
  async function togglePractice(q: QuestionListItem) {
    setBusyId(q.id);
    setNotice(null);
    try {
      if (q.inPracticeLibrary) {
        await removeFromPracticeLibrary(q.id);
        setNotice("Removed from the practice library.");
      } else {
        await addToPracticeLibrary(q.id);
        setNotice("Added to the practice library — students can drill it now.");
      }
      reload();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not update the library.",
      );
    } finally {
      setBusyId(null);
    }
  }

  // Filters (including the tab's status and "only mine") are applied
  // server-side, `offset` pages through whatever that filtered set is.
  const { data, loading, error, refreshing, reload } = useAdminData(
    () => listQuestions({ ...query, limit: PAGE, offset }),
    [JSON.stringify(query), offset],
  );
  /**
   * True from the first keystroke until the matching results are on screen —
   * both while the debounce is still settling and while the request runs, so
   * the box never looks idle between the two.
   */
  const searchPending =
    (filters.search ?? "") !== (debouncedSearch ?? "") || refreshing;
  const rows = useMemo(() => data?.items ?? [], [data]);
  // Total for the CURRENT tab/filter combination — what pagination pages
  // through. Distinct from `counts.all` below, which ignores the tab.
  const total = data?.total ?? 0;
  /**
   * Status tallies over the whole bank (minus the tab's own status filter),
   * from the server — not derived from whatever page happens to be loaded.
   * A 20,000-question bank paginated at 50 rows would make client-computed
   * tab badges wrong the instant a status has more than one page of rows.
   */
  const counts = data?.counts;

  // The filter dropdowns are populated from a separate, UNFILTERED query so the
  // available options don't collapse to whatever the current filter returned.
  const { data: facetData } = useAdminData(
    () => listQuestions({ limit: 200 }),
    [],
  );
  const facetSource = useMemo(() => facetData?.items ?? [], [facetData]);

  const countFor = (s: QuestionStatus | null): number => {
    if (!counts) return 0;
    if (s === null) return counts.all;
    const key = s.toLowerCase() as
      "draft" | "review" | "approved" | "rejected" | "archived";
    return counts[key];
  };
  const bankTotal = counts?.all ?? 0;
  const approved = counts?.approved ?? 0;

  return (
    <AdminShell title="Question Bank">
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
            <p className="text-sm text-admin-muted">
              Manage and review all your exam questions in one place
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/question-taxonomy"
              className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
            >
              <LayersIcon className="size-4 text-admin-muted" /> Taxonomy
            </Link>
            <OutlineBtn icon={UploadIcon} onClick={() => setImportOpen(true)}>
              Import
            </OutlineBtn>
            <OutlineBtn icon={DownloadIcon} onClick={() => setExportOpen(true)}>
              Export
            </OutlineBtn>
            <button
              onClick={() => setAuthorOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              <PlusIcon className="size-4" /> Add Question
            </button>
          </div>
        </div>

        {/* Stat cards (live counts) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={DatabaseIcon}
            label="Total Questions"
            value={fmt(bankTotal)}
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Approved"
            value={fmt(approved)}
            hint={
              bankTotal ? `${Math.round((approved / bankTotal) * 100)}%` : "0%"
            }
            tone="good"
            progress={bankTotal ? Math.round((approved / bankTotal) * 100) : 0}
          />
          <StatCard
            icon={SlidersIcon}
            label="Needs Your Review"
            value={fmt(counts?.review ?? 0)}
            chip="Pending + Corrections"
            accent
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Archived"
            value={fmt(counts?.archived ?? 0)}
            hint="INACTIVE"
            tone="muted"
          />
        </div>

        {/* Panel */}
        <section className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
          <div className="p-4">
            <QuestionFilterBar
              value={filters}
              onChange={setFilters}
              searching={searchPending}
              facetSource={facetSource}
              resultCount={total}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
            <div className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() => setOnlyMine((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-admin-muted"
              >
                Only mine
                <span
                  className={`relative h-5 w-9 rounded-full transition-colors ${onlyMine ? "bg-admin" : "bg-admin-line"}`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${onlyMine ? "left-[18px]" : "left-0.5"}`}
                  />
                </span>
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink">
                All Collections{" "}
                <ChevronDownIcon className="size-4 text-admin-muted" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-6 border-b border-admin-line/60 px-4">
            {TABS.map((t, i) => {
              const c = countFor(t.status);
              return (
                <button
                  key={t.label}
                  onClick={() => setTab(i)}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${i === tab ? "border-admin text-admin" : "border-transparent text-admin-muted hover:text-admin-ink"}`}
                >
                  {t.label}
                  <span className="rounded-full bg-admin-surface px-2 py-0.5 text-xs text-admin-muted">
                    {fmt(c)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="size-4 accent-admin" />
                  </th>
                  <th className="px-4 py-3">Question Preview</th>
                  <th className="px-4 py-3">Subject / Chapter</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {loading && <TableMessage>Loading questions…</TableMessage>}
                {!loading && error && (
                  <TableMessage tone="error">{error}</TableMessage>
                )}
                {!loading && !error && rows.length === 0 && (
                  <TableMessage>No questions in this view.</TableMessage>
                )}
                {!loading &&
                  !error &&
                  rows.map((q) => (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      busy={busyId === q.id}
                      onTogglePractice={togglePractice}
                      onOpen={() => {
                        setSelectedId(q.id);
                        setDetailOpen(true);
                      }}
                    />
                  ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-admin-line/60 px-4 py-3">
            <PaginationBar
              offset={offset}
              pageSize={PAGE}
              total={total}
              onOffsetChange={setOffset}
              itemLabel="questions"
            />
          </div>
        </section>
      </div>

      <QuestionImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setNotice("Questions imported.");
          reload();
        }}
      />
      <QuestionExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
      <QuestionAuthorDrawer
        // Remounts when the target changes so the form re-seeds from it.
        key={editingQuestion?.id ?? "new"}
        open={authorOpen}
        editing={editingQuestion}
        onClose={() => {
          setAuthorOpen(false);
          setEditingQuestion(null);
        }}
        onCreated={() => {
          setNotice(
            editingQuestion
              ? "Question updated."
              : "Question saved as a draft.",
          );
          reload();
        }}
      />
      <QuestionDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        questionId={selectedId}
        onEdit={(q) => {
          setDetailOpen(false);
          setEditingQuestion(q);
          setAuthorOpen(true);
        }}
        onActioned={(action, status) => {
          setNotice(`Question ${action}d — now ${status}.`);
          // Counts and tab filters derive from the fetched list, so re-read it.
          reload();
        }}
      />
    </AdminShell>
  );
}

function QuestionRow({
  q,
  onOpen,
  onTogglePractice,
  busy,
}: {
  q: QuestionListItem;
  onOpen: () => void;
  onTogglePractice: (q: QuestionListItem) => void;
  busy: boolean;
}) {
  const Icon =
    q.status === "REVIEW"
      ? FlagIcon
      : q.type === "INTEGER"
        ? AlignLeftIcon
        : TargetIcon;
  const code = `${q.subject.slice(0, 3).toUpperCase()}-${q.id.slice(0, 4).toUpperCase()}`;
  const diff = q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase();
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer hover:bg-admin-bg/40 ${q.status === "REVIEW" ? "bg-[#fff8ec]" : ""}`}
    >
      <td className="px-4 py-4 align-top">
        <input type="checkbox" className="mt-1 size-4 accent-admin" />
      </td>
      <td className="px-4 py-4">
        <div className="flex gap-3">
          <Icon
            className={`mt-0.5 size-4 shrink-0 ${q.status === "REVIEW" ? "text-warn" : "text-admin-subtle"}`}
          />
          <div className="max-w-md">
            <span className="inline-block rounded bg-admin-surface px-1.5 py-0.5 font-mono text-[11px] text-admin-muted">
              ID: {code}
            </span>
            <p className="mt-1 line-clamp-2 text-admin-ink">{q.statement}</p>
            {q.inPracticeLibrary && (
              <span className="mt-1 inline-flex items-center gap-1 rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-bold text-info">
                ★ In practice library
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-admin-ink">{q.subject}</p>
        <p className="text-xs text-admin-subtle">{q.chapter}</p>
      </td>
      <td className="px-4 py-4 align-top text-admin-ink">{diff}</td>
      <td className="px-4 py-4 align-top">
        <StatusPill status={q.status} />
      </td>
      <td className="px-4 py-4 text-right align-top">
        <div className="flex items-center justify-end gap-2">
          {q.status === "APPROVED" && (
            <button
              disabled={busy}
              title={
                q.inPracticeLibrary
                  ? "Remove from the student practice library"
                  : "Add to the student practice library (no approval needed)"
              }
              onClick={(e) => {
                e.stopPropagation();
                onTogglePractice(q);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase disabled:opacity-50 ${
                q.inPracticeLibrary
                  ? "border-admin-line bg-white text-admin-muted hover:bg-admin-bg"
                  : "border-admin bg-admin/5 text-admin hover:bg-admin/10"
              }`}
            >
              {q.inPracticeLibrary ? "Remove" : "+ Practice"}
            </button>
          )}
          {q.status === "REVIEW" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              title="Open this question to approve or reject it"
              className="rounded-lg bg-admin px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
            >
              Review Now
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              title="Open question details"
              className="text-admin-muted hover:text-admin-ink"
            >
              <MoreVerticalIcon className="size-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function TableMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <tr>
      <td
        colSpan={6}
        className={`px-4 py-10 text-center ${tone === "error" ? "text-danger" : "text-admin-muted"}`}
      >
        {children}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: QuestionStatus }) {
  const map: Record<QuestionStatus, string> = {
    APPROVED: "bg-admin-mint/50 text-admin",
    REVIEW: "bg-warn/15 text-[#c77700]",
    DRAFT: "bg-admin-surface text-admin-muted",
    REJECTED: "bg-danger-soft text-danger",
    ARCHIVED: "bg-danger/10 text-danger",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${map[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function OutlineBtn({
  icon: Icon,
  children,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
    >
      <Icon className="size-4 text-admin-muted" />
      {children}
    </button>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}
