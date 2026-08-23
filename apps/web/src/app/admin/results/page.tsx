"use client";

import type { ComponentType, SVGProps } from "react";
import { useCallback, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ActionButton } from "@/components/action-button";
import { ResultDetailDrawer } from "@/components/admin/result-detail-drawer";
import {
  PublishResultsModal,
  RecalculateResultsModal,
} from "@/components/admin/results-modals";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/admin/icons";
import { useAdminData } from "@/hooks/use-admin-data";
import {
  evaluateExam,
  holdResults,
  listExamResults,
  publishResults,
  type ExamResultRow,
} from "@/lib/admin";
import { examDisplayStatus, listExams, type ExamListItem } from "@/lib/exams";

type RStatus = "PUBLISHED" | "PROCESSING" | "HELD";

interface RRow {
  examId: string;
  exam: string;
  batches: number;
  date: string;
  participants: number;
  status: RStatus;
  alert?: boolean;
  results: ExamResultRow[];
}

const TABS = ["All", "Held", "Published", "Processing"];

/**
 * Results are per-exam, so the table is driven by GET /exams and enriched with
 * GET /exams/:id/results for every exam whose window has closed (the only ones
 * that can have results). Status is derived: no rows yet → still processing,
 * all rows published → PUBLISHED, otherwise HELD.
 */
function useResultRows() {
  const loader = useCallback(async () => {
    const exams = await listExams();
    const finished = exams.filter((e) => {
      const s = examDisplayStatus(e);
      return s === "COMPLETED" || s === "PUBLISHED";
    });
    const withResults = await Promise.all(
      finished.map(async (e) => {
        let results: ExamResultRow[] = [];
        try {
          results = await listExamResults(e.id);
        } catch {
          // An un-evaluated exam has no result rows yet — treat as processing.
        }
        return { exam: e, results };
      }),
    );
    return withResults.map(({ exam, results }) => toRow(exam, results));
  }, []);

  return useAdminData(loader, []);
}

function toRow(e: ExamListItem, results: ExamResultRow[]): RRow {
  const status: RStatus =
    results.length === 0
      ? "PROCESSING"
      : results.every((r) => r.published)
        ? "PUBLISHED"
        : "HELD";
  return {
    examId: e.id,
    exam: e.title,
    batches: e._count.batches,
    date: e.endAt
      ? new Date(e.endAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—",
    participants: results.length,
    status,
    alert: results.some((r) => r.attempt.flagged),
    results,
  };
}

export default function ResultsPage() {
  const [tab, setTab] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);
  /**
   * The exam the detail drawer is showing, held as an ID rather than a copy of
   * the row. A snapshot would go stale the moment a correction re-scored the
   * paper, and the drawer would keep showing the old ranked table underneath
   * the panel that had just changed it.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The search box here was decorative. The rows are already in memory, so it
  // filters them directly rather than needing a round-trip.
  const [search, setSearch] = useState("");

  const { data, loading, error, reload } = useResultRows();
  const rows = useMemo(() => data ?? [], [data]);
  const selected = useMemo(
    () => rows.find((r) => r.examId === selectedId) ?? null,
    [rows, selectedId],
  );

  const visible = useMemo(() => {
    const want = TABS[tab];
    const byTab =
      want === "All"
        ? rows
        : rows.filter((r) => r.status === want.toUpperCase());
    const q = search.trim().toLowerCase();
    return q ? byTab.filter((r) => r.exam.toLowerCase().includes(q)) : byTab;
  }, [rows, tab, search]);

  const stats = useMemo(
    () => ({
      processing: rows.filter((r) => r.status === "PROCESSING").length,
      held: rows.filter((r) => r.status === "HELD").length,
      published: rows.filter((r) => r.status === "PUBLISHED").length,
      flagged: rows.reduce(
        (n, r) => n + r.results.filter((x) => x.attempt.flagged).length,
        0,
      ),
    }),
    [rows],
  );

  /** Run a write action, surface the outcome, then refresh via a full reload. */
  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setNotice(null);
    try {
      setNotice(await fn());
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Results">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">Results</h2>
            <p className="mt-1 text-sm text-admin-muted">
              Review, publish, and manage results for all your exams
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setPublishOpen(true)}
              className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-admin-ink hover:bg-admin-bg"
            >
              Publication Centre
            </button>
            <button
              onClick={() => setRecalcOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:opacity-95"
            >
              <PlusIcon className="size-4" /> Process New Result
            </button>
          </div>
        </div>

        {notice && (
          <p
            role="status"
            className="rounded-lg border border-admin/30 bg-admin/5 px-4 py-2.5 text-sm text-admin"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={ClockIcon}
            label="Awaiting Processing"
            value={loading ? "—" : String(stats.processing)}
          />
          <StatCard
            icon={SlidersIcon}
            label="Held for Review"
            value={loading ? "—" : String(stats.held)}
            chip={stats.held > 0 ? "Action Required" : undefined}
            chipTone="warn"
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Published"
            value={loading ? "—" : String(stats.published)}
          />
          <StatCard
            icon={AlertTriangleIcon}
            label="Flagged Attempts"
            value={loading ? "—" : String(stats.flagged)}
            link={stats.flagged > 0 ? "Resolve" : undefined}
            danger={stats.flagged > 0}
          />
        </div>

        {/* Panel */}
        <section className="rounded-2xl border border-admin-line/60 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-1 rounded-full bg-admin-bg p-1">
              {TABS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTab(i)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                    i === tab
                      ? "bg-white text-admin-ink shadow-sm"
                      : "text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex items-center">
                <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search exams…"
                  className="h-9 w-56 rounded-lg border border-admin-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
                />
              </div>
              {/*
                A "2023 - 2024" button used to sit here. It was a hardcoded
                string with no handler and no concept behind it — the platform
                has no academic-session model at all, so it could not have
                filtered anything. Removed rather than wired to an invention.
              */}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-y border-admin-line/60 bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="px-6 py-3">Exam Name</th>
                  <th className="px-6 py-3">Batches</th>
                  <th className="px-6 py-3">Closed</th>
                  <th className="px-6 py-3">Participants</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {loading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-admin-muted"
                    >
                      Loading results…
                    </td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-admin-muted"
                    >
                      No exams have closed yet, so there are no results to
                      process.
                    </td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr
                    key={r.examId}
                    className={`hover:bg-admin-bg/40 ${r.alert ? "bg-[#fbf3f2]" : ""}`}
                  >
                    <td className="px-6 py-4 font-bold text-admin-ink">
                      {r.exam}
                    </td>
                    <td className="px-6 py-4 text-admin-muted">{r.batches}</td>
                    <td className="px-6 py-4 text-admin-muted">{r.date}</td>
                    <td className="px-6 py-4 text-admin-ink">
                      {r.participants}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ResultPill status={r.status} />
                        {r.alert && (
                          <AlertTriangleIcon className="size-4 text-danger" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {r.status === "PROCESSING" ? (
                          <ActionButton
                            disabled={busy !== null}
                            loading={busy === r.examId}
                            loadingText="Evaluating…"
                            onClick={() =>
                              run(r.examId, async () => {
                                const res = await evaluateExam(r.examId);
                                return `Evaluated ${res.evaluated} attempt(s) · max ${res.maxScore}`;
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-admin px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:opacity-95 disabled:opacity-50"
                          >
                            Evaluate
                          </ActionButton>
                        ) : r.status === "HELD" ? (
                          <ActionButton
                            disabled={busy !== null}
                            loading={busy === r.examId}
                            loadingText="Publishing…"
                            onClick={() =>
                              run(r.examId, async () => {
                                const res = await publishResults(r.examId);
                                return `Published ${res.published} result(s)`;
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-admin px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:opacity-95 disabled:opacity-50"
                          >
                            Publish
                          </ActionButton>
                        ) : (
                          <ActionButton
                            disabled={busy !== null}
                            loading={busy === r.examId}
                            loadingText="Holding…"
                            onClick={() =>
                              run(r.examId, async () => {
                                const res = await holdResults(r.examId);
                                return `Held ${res.held} result(s)`;
                              })
                            }
                            className="rounded-lg border border-admin-line bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                          >
                            Hold
                          </ActionButton>
                        )}
                        <button
                          onClick={() => {
                            setSelectedId(r.examId);
                            setDetailOpen(true);
                          }}
                          className="rounded-lg border border-admin-line bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-admin-ink hover:bg-admin-bg"
                        >
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ResultDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onPublish={() => setPublishOpen(true)}
        onRecalculate={() => setRecalcOpen(true)}
        examTitle={selected?.exam}
        examId={selected?.examId}
        results={selected?.results}
        /**
         * Refresh the rows in place. This used to reload the page, which closed
         * the drawer ~900ms after any answer-key correction — including the
         * moment a question was set to Manual, taking the Grade button with it.
         */
        onChanged={reload}
      />
      <PublishResultsModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        examId={selected?.examId}
        examTitle={selected?.exam}
        onPublished={(n) => {
          setNotice(`Published ${n} result(s).`);
          reload();
        }}
      />
      <RecalculateResultsModal
        open={recalcOpen}
        onClose={() => setRecalcOpen(false)}
        examId={selected?.examId}
        onRecalculated={(n) => {
          setNotice(`Re-evaluated ${n} attempt(s).`);
          reload();
        }}
      />
    </AdminShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  badge,
  chip,
  chipTone,
  link,
  danger,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  badge?: string;
  chip?: string;
  chipTone?: "warn";
  link?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${danger ? "border-danger/30" : "border-admin-line/60"}`}
    >
      <div className="flex items-start justify-between">
        <p
          className={`text-sm font-semibold ${danger ? "text-danger" : "text-admin-muted"}`}
        >
          {label}
        </p>
        <span
          className={`flex size-9 items-center justify-center rounded-full ${danger ? "text-danger" : "text-admin-subtle"}`}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p
          className={`text-4xl font-bold ${danger ? "text-danger" : "text-admin-ink"}`}
        >
          {value}
        </p>
        {badge && (
          <span className="rounded-full bg-admin-mint/50 px-2.5 py-1 text-xs font-semibold text-admin">
            {badge}
          </span>
        )}
        {chip && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${chipTone === "warn" ? "bg-warn/20 text-[#c77700]" : "bg-admin-surface text-admin-muted"}`}
          >
            {chip}
          </span>
        )}
        {link && (
          <a className="text-sm font-semibold text-danger underline">{link}</a>
        )}
      </div>
    </div>
  );
}

function ResultPill({ status }: { status: RStatus }) {
  const map: Record<RStatus, string> = {
    PUBLISHED: "bg-admin-mint/50 text-admin",
    PROCESSING: "bg-[#e7edff] text-[#3d5afe]",
    HELD: "bg-warn/20 text-[#c77700]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${map[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
