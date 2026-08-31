"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PaginationBar } from "@/components/pagination-bar";
import { BarList, Panel, StatCard } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import {
  fetchExamAnalytics,
  listExamResults,
  type ExamAnalytics,
  type ExamResultRow,
} from "@/lib/admin";
import { examDisplayStatus, listExams, type ExamListItem } from "@/lib/exams";

/**
 * Student reporting for teachers.
 *
 * Read-only by design: a teacher can see how a cohort performed and where a
 * question went wrong, but evaluating, awarding bonus marks and publishing stay
 * with an administrator. The API enforces that too — this UI simply does not
 * offer what would be refused.
 *
 * `useSearchParams()` (a deep link from the Assessments list's "View
 * Results") forces a client bail-out, which Next requires to sit behind a
 * Suspense boundary or the production prerender of this route fails.
 */
export default function TeacherReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsScreen />
    </Suspense>
  );
}

function ReportsScreen() {
  const params = useSearchParams();
  const deepLinkExamId = params.get("examId");
  const [exams, setExams] = useState<ExamListItem[] | null>(null);
  const [examId, setExamId] = useState<string>("");
  const [results, setResults] = useState<ExamResultRow[] | null>(null);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const PAGE = 100;
  const [analytics, setAnalytics] = useState<ExamAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** A changed exam invalidates whatever page of its result sheet was
   *  loaded — reset during render (React's documented "adjust state when a
   *  prop changes" pattern) rather than in an effect. */
  const [prevExamId, setPrevExamId] = useState(examId);
  if (examId !== prevExamId) {
    setPrevExamId(examId);
    setOffset(0);
  }

  useEffect(() => {
    let cancelled = false;
    // Mock Tests and Assessments (§ Assessments) are both real exam records
    // a teacher may want a result sheet for — merged into one dropdown here
    // rather than giving assessments a second, near-identical reports page.
    Promise.all([
      listExams({ kind: "MOCK_TEST" }),
      listExams({ kind: "ASSESSMENT" }),
    ])
      .then(([mockTests, assessments]) => {
        if (cancelled) return;
        // Only exams that have actually run can have results worth reading.
        const sat = [...mockTests.items, ...assessments.items].filter((e) =>
          ["LIVE", "COMPLETED", "PUBLISHED"].includes(examDisplayStatus(e)),
        );
        setExams(sat);
        const preselect =
          deepLinkExamId && sat.some((e) => e.id === deepLinkExamId)
            ? deepLinkExamId
            : (sat[0]?.id ?? "");
        if (preselect) setExamId(preselect);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load exams");
        setExams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deepLinkExamId]);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setResults(null);
      setAnalytics(null);
      const [r, a] = await Promise.allSettled([
        listExamResults(examId, { limit: PAGE, offset }),
        fetchExamAnalytics(examId),
      ]);
      if (cancelled) return;
      setResults(r.status === "fulfilled" ? r.value.items : []);
      setResultsTotal(r.status === "fulfilled" ? r.value.total : 0);
      if (a.status === "fulfilled") setAnalytics(a.value);
      // A result set that has not been evaluated yet is a normal state, not an
      // error — the panels below say so rather than showing a red banner.
      setError(
        r.status === "rejected" && a.status === "rejected"
          ? "Could not load this exam's results."
          : null,
      );
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [examId, offset]);

  const ranked = useMemo(
    () => (results ?? []).slice().sort((a, b) => b.totalScore - a.totalScore),
    [results],
  );

  return (
    <TeacherShell title="Student Reports">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-admin-muted">
          Exam
          <select
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            disabled={!exams || exams.length === 0}
            className="rounded-lg border border-admin-line bg-white px-3 py-2 text-sm text-admin-ink outline-none focus:border-admin disabled:opacity-50"
          >
            {(exams ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.kind === "ASSESSMENT" ? `[Assessment] ${e.title}` : e.title}
              </option>
            ))}
            {exams?.length === 0 && <option>No exams have run yet</option>}
          </select>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {exams?.length === 0 ? (
        <Panel title="No results yet" subtitle="">
          <p className="rounded-xl border border-dashed border-admin-line p-10 text-center text-sm text-admin-muted">
            Reports appear once an exam has been sat. Build a paper and send it
            for approval to get started.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Candidates"
              value={loading ? undefined : resultsTotal}
            />
            <StatCard
              label="Average score"
              value={
                loading
                  ? undefined
                  : analytics
                    ? analytics.score.average.toFixed(1)
                    : ranked.length
                      ? (
                          ranked.reduce((s, r) => s + r.totalScore, 0) /
                          ranked.length
                        ).toFixed(1)
                      : "—"
              }
            />
            <StatCard
              label="Highest"
              value={
                loading
                  ? undefined
                  : analytics
                    ? analytics.score.highest
                    : ranked.length
                      ? ranked[0].totalScore
                      : "—"
              }
            />
            <StatCard
              label="Lowest"
              value={
                loading
                  ? undefined
                  : analytics
                    ? analytics.score.lowest
                    : ranked.length
                      ? ranked[ranked.length - 1].totalScore
                      : "—"
              }
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Top performers" subtitle="By total score">
              <BarList
                items={ranked.slice(0, 8).map((r) => ({
                  label: r.student.user.name,
                  value: r.totalScore,
                }))}
                empty={
                  loading
                    ? "Loading…"
                    : "No results yet — this exam has not been evaluated."
                }
              />
            </Panel>

            <Panel
              title="Score distribution"
              subtitle="How many candidates landed in each band"
            >
              <BarList
                items={(analytics?.distribution ?? []).map((d) => ({
                  label: d.range,
                  value: d.count,
                }))}
                format={(v) => `${v} candidate${v === 1 ? "" : "s"}`}
                empty={loading ? "Loading…" : "Not evaluated yet"}
              />
            </Panel>
          </div>

          <div className="mt-6">
            <Panel
              title="Full result sheet"
              subtitle="Read-only — evaluation and publishing are an administrator's decision"
            >
              {loading ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-lg bg-admin-line/15"
                    />
                  ))}
                </div>
              ) : ranked.length === 0 ? (
                <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
                  Nothing to show. Results appear once an administrator has
                  evaluated this exam.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-admin-line text-xs font-bold uppercase tracking-wide text-admin-muted">
                        <th className="px-3 py-3">#</th>
                        <th className="px-3 py-3">Candidate</th>
                        <th className="px-3 py-3">Score</th>
                        <th className="px-3 py-3">Correct</th>
                        <th className="px-3 py-3">Wrong</th>
                        <th className="px-3 py-3">Unattempted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => (
                        <tr
                          key={r.id}
                          className="border-b border-admin-line/50"
                        >
                          <td className="px-3 py-3 font-semibold text-admin-muted">
                            {i + 1}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-admin-ink">
                              {r.student.user.name}
                            </p>
                            <p className="text-xs text-admin-muted">
                              {r.student.rollNumber}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-bold text-admin">
                            {r.totalScore}
                            <span className="text-xs font-normal text-admin-muted">
                              /{r.maxScore}
                            </span>
                          </td>
                          <td className="px-3 py-3">{r.correctCount}</td>
                          <td className="px-3 py-3">{r.incorrectCount}</td>
                          <td className="px-3 py-3">{r.unattemptedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!loading && ranked.length > 0 && (
                <PaginationBar
                  offset={offset}
                  pageSize={PAGE}
                  total={resultsTotal}
                  onOffsetChange={setOffset}
                  itemLabel="candidates"
                  className="mt-4"
                />
              )}
            </Panel>
          </div>

          {analytics && analytics.questions.length > 0 && (
            <div className="mt-6">
              <Panel
                title="Hardest questions"
                subtitle="Lowest success rate first — where the cohort struggled"
              >
                <ul className="flex flex-col gap-3">
                  {analytics.questions
                    .slice()
                    .sort((a, b) => a.correctPct - b.correctPct)
                    .slice(0, 8)
                    .map((q) => (
                      <li key={q.questionId}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="line-clamp-1 text-sm text-admin-ink">
                            {q.statement}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-admin">
                            {Math.round(q.correctPct)}% correct
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-admin-surface">
                          <div
                            className="h-full rounded-full bg-admin"
                            style={{ width: `${Math.max(2, q.correctPct)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-admin-muted">
                          {q.correct} correct · {q.incorrect} wrong ·{" "}
                          {q.unattempted} skipped
                        </p>
                      </li>
                    ))}
                </ul>
              </Panel>
            </div>
          )}
        </>
      )}
    </TeacherShell>
  );
}
