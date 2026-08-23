"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ChevronLeftIcon, TrophyIcon } from "@/components/student/icons";
import {
  ChampionHero,
  Podium,
  RankedTable,
  SubjectToppers,
} from "@/components/student/leaderboard-parts";
import { StudentShell } from "@/components/student/student-shell";
import { useMyAttempts } from "@/hooks/use-my-attempts";
import {
  fetchAttemptLeaderboard,
  type Leaderboard,
  type LeaderboardScope,
} from "@/lib/student";

/**
 * Performance Reports / Leaderboard (Figma node 280:2093).
 *
 * A leaderboard is per paper, so the screen is driven by which of the
 * candidate's own published results they pick — the exam selector is the real
 * control, not decoration. The second selector chooses the cohort the ranking
 * is measured within, which a rank is meaningless without.
 *
 * Everything shown about other candidates is shaped by the server: peers are
 * already abbreviated and carry no roll number when they arrive here.
 */

const TOP_SLICE = 10;
const FULL_SLICE = 100;

export default function StudentLeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardScreen />
    </Suspense>
  );
}

function LeaderboardScreen() {
  const params = useSearchParams();
  /**
   * `?attempt=` deep-links the board to one paper, which is how the result page
   * hands off: a candidate looking at their result for a specific exam expects
   * the leaderboard for THAT exam, not for whichever paper happens to be
   * newest.
   */
  const requested = params.get("attempt");
  const { items: attempts, loading: attemptsLoading } = useMyAttempts();

  /**
   * Only papers whose results are actually out. Offering a held paper here
   * would put an entry in the picker that can only ever answer "not available".
   */
  const published = useMemo(
    () => (attempts ?? []).filter((a) => a.resultState === "PUBLISHED"),
    [attempts],
  );

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [scope, setScope] = useState<LeaderboardScope>("overall");
  const [expanded, setExpanded] = useState(false);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Honour a deep link if it names a paper whose result is actually out;
  // otherwise fall back to the most recent one.
  useEffect(() => {
    if (attemptId || published.length === 0) return;
    const wanted = published.find((a) => a.id === requested);
    const id = setTimeout(() => setAttemptId((wanted ?? published[0]).id), 0);
    return () => clearTimeout(id);
  }, [attemptId, published, requested]);

  const load = useCallback(
    async (id: string, s: LeaderboardScope, full: boolean) => {
      setLoading(true);
      setError(null);
      try {
        setBoard(
          await fetchAttemptLeaderboard(id, s, full ? FULL_SLICE : TOP_SLICE),
        );
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Could not load the leaderboard.",
        );
        setBoard(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!attemptId) return;
    const t = setTimeout(() => void load(attemptId, scope, expanded), 0);
    return () => clearTimeout(t);
  }, [attemptId, scope, expanded, load]);

  const selected = published.find((a) => a.id === attemptId) ?? null;

  return (
    <StudentShell breadcrumb={["Performance Reports", "Leaderboard"]}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/student/reports"
            className="inline-flex items-center gap-1 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            <ChevronLeftIcon className="size-3.5" />
            Performance Reports
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.6px] text-admin-ink">
            Leaderboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex flex-col gap-1">
            <span className="sr-only">Exam</span>
            <select
              value={attemptId ?? ""}
              onChange={(e) => {
                setExpanded(false);
                setAttemptId(e.target.value || null);
              }}
              disabled={published.length === 0}
              className="h-11 rounded-lg bg-board-head px-4 text-sm text-admin-ink shadow-[0_4px_6px_rgba(0,0,0,0.02)] outline-none focus:ring-2 focus:ring-admin disabled:opacity-60"
            >
              {published.length === 0 ? (
                <option value="">No published results yet</option>
              ) : (
                published.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.exam.title}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="sr-only">Ranked within</span>
            <select
              value={scope}
              onChange={(e) => {
                setExpanded(false);
                setScope(e.target.value as LeaderboardScope);
              }}
              className="h-11 rounded-lg bg-board-head px-4 text-sm text-admin-ink shadow-[0_4px_6px_rgba(0,0,0,0.02)] outline-none focus:ring-2 focus:ring-admin"
            >
              <option value="overall">All candidates</option>
              <option value="batch">My batch</option>
            </select>
          </label>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {attemptsLoading || (loading && !board) ? (
        <Skeleton />
      ) : published.length === 0 ? (
        <Empty
          title="No results published yet"
          body="Once a result is released, the leaderboard for that paper appears here."
        />
      ) : board === null ? null : !board.available ? (
        <Empty
          title="Not enough candidates for a leaderboard"
          body={`Only ${board.cohortSize} ${
            board.cohortSize === 1 ? "candidate has" : "candidates have"
          } a result for ${board.exam.title}. A ranking needs at least ${
            board.minimum
          } — below that it would single people out rather than compare them.`}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {board.champion && <ChampionHero champion={board.champion} />}

          <Podium
            entries={board.podium}
            percentileBasis={board.percentileBasis}
          />

          <SubjectToppers toppers={board.subjectToppers} />

          <RankedTable
            rows={board.rows}
            truncated={board.truncated || expanded}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />

          <p className="text-center text-xs text-admin-subtle">
            {board.scope === "BATCH"
              ? `Ranked within your batch, percentiles too · ${board.cohortSize} candidate(s)`
              : `Ranked across all candidates · ${board.cohortSize} candidate(s)`}
            {selected ? ` · ${selected.exam.title}` : ""}
          </p>
        </div>
      )}
    </StudentShell>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-64 animate-pulse rounded-3xl bg-admin-line/20" />
      <div className="flex items-end justify-center gap-8">
        <div className="h-40 w-32 animate-pulse rounded-t-xl bg-admin-line/20" />
        <div className="h-56 w-40 animate-pulse rounded-t-xl bg-admin-line/20" />
        <div className="h-28 w-32 animate-pulse rounded-t-xl bg-admin-line/20" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-admin-line/20" />
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-admin-line p-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
        <TrophyIcon className="size-5" />
      </span>
      <p className="mt-4 font-bold text-admin-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">{body}</p>
    </div>
  );
}
