"use client";

import {
  AtomIcon,
  BookOpenIcon,
  FlaskIcon,
  LeafIcon,
  StarIcon,
  TargetIcon,
} from "@/components/student/icons";
import type { LeaderboardEntry, SubjectTopper } from "@/lib/student";

/**
 * The pieces of the Leaderboard screen (Figma: Performance Reports /
 * Leaderboard): the champion hero, the three-step podium, and the subject
 * topper cards.
 *
 * Split out of the page because each one is a self-contained piece of the
 * design with its own measurements, and the page is otherwise just data
 * plumbing and the table.
 */

/** Marks as a percentage, or null when the paper carries no obtainable marks. */
function pct(score: number, max: number): number | null {
  if (!max) return null;
  return Math.round((score / max) * 1000) / 10;
}

function formatPercentile(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 10) / 10}%`;
}

/* ------------------------------------------------------------------ *
 * CHAMPION HERO                                                       *
 * ------------------------------------------------------------------ */

export function ChampionHero({ champion }: { champion: LeaderboardEntry }) {
  return (
    <section
      aria-label="Overall champion"
      className="relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-3xl bg-champion p-8 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)]"
    >
      {/* The design's soft glow behind the avatar. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-champion-mint/10 blur-3xl"
      />

      <div className="relative min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-champion-mint px-4 py-1 text-sm font-semibold text-champion">
          OVERALL CHAMPION
        </span>
        <p className="mt-4 text-sm uppercase tracking-[0.8px] text-white/80">
          Overall topper
        </p>
        <h2 className="mt-1 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-[60px] lg:leading-[60px]">
          {champion.name}
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-4xl font-bold text-champion-mint sm:text-5xl lg:text-[60px] lg:leading-[60px]">
            {champion.totalScore}
          </span>
          <span className="text-2xl text-white/60 lg:text-3xl">
            / {champion.maxScore}
          </span>
        </p>

        {champion.sections.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-3">
            {champion.sections.map((s) => (
              <li
                key={s.sectionId}
                className="rounded-full border border-champion-mint/50 bg-black/10 px-4 py-2 text-sm text-champion-mint"
              >
                {s.name}: {s.score}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative flex size-40 shrink-0 items-center justify-center rounded-full border-4 border-champion-mint bg-champion-mint p-1 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] sm:size-52 lg:size-64">
        <span className="text-5xl font-bold text-champion-ink lg:text-[60px]">
          {champion.initials}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * PODIUM                                                              *
 * ------------------------------------------------------------------ */

/**
 * Per-place styling. A lookup rather than conditionals so the three tiers stay
 * legible side by side, and so a fourth place can never fall through to
 * whatever the last branch happened to be.
 */
const PLACE = {
  1: {
    block: "h-56 bg-champion shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
    numeral: "text-white/90 text-6xl sm:text-[96px] sm:leading-[96px]",
    avatar: "size-24 sm:size-32 border-champion bg-champion-mint",
    initials: "text-3xl sm:text-4xl text-champion-ink",
    veil: "from-black/30",
    width: "w-40 sm:w-48",
  },
  2: {
    block: "h-40 bg-rank-2 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)]",
    numeral: "text-white/80 text-5xl sm:text-[60px] sm:leading-[60px]",
    avatar: "size-20 sm:size-24 border-rank-2 bg-board-line",
    initials: "text-xl sm:text-2xl text-admin-muted",
    veil: "from-black/20",
    width: "w-32 sm:w-40",
  },
  3: {
    block: "h-28 bg-rank-3 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]",
    numeral: "text-admin-ink/70 text-5xl sm:text-[60px] sm:leading-[60px]",
    avatar: "size-20 sm:size-24 border-rank-3 bg-board-line",
    initials: "text-xl sm:text-2xl text-admin-muted",
    veil: "from-black/10",
    width: "w-32 sm:w-40",
  },
} as const;

export function Podium({
  entries,
  percentileBasis,
}: {
  entries: LeaderboardEntry[];
  /** Named on the figure, so flipping the scope cannot silently change what
      the percentage under a name means. */
  percentileBasis: "OVERALL" | "BATCH";
}) {
  const basisLabel =
    percentileBasis === "BATCH"
      ? "Percentile within your batch"
      : "Percentile across all candidates";
  const byPlace = (place: 1 | 2 | 3) => entries[place - 1] ?? null;
  // Second, first, third — the podium reads outward from the middle, so the
  // tallest block sits in the centre the way it does on a real one.
  const order: (1 | 2 | 3)[] = [2, 1, 3];

  return (
    <section aria-label="Top three">
      <div className="flex flex-wrap items-end justify-center gap-6 sm:gap-8">
        {order.map((place) => {
          const entry = byPlace(place);
          if (!entry) return null;
          const style = PLACE[place];
          return (
            <div
              key={place}
              className={`flex flex-col items-center ${style.width}`}
            >
              <div className="relative">
                <div
                  className={`flex items-center justify-center rounded-full border-4 ${style.avatar} shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)]`}
                >
                  <span className={`font-bold ${style.initials}`}>
                    {entry.initials}
                  </span>
                </div>
                {place === 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-2 flex size-8 items-center justify-center rounded-full bg-amber-400 text-white shadow-md"
                  >
                    <StarIcon className="size-4" />
                  </span>
                )}
              </div>

              <p className="mt-4 text-center text-sm font-semibold text-admin-ink">
                {entry.name}
                {entry.you && (
                  <span className="ml-1 text-xs font-bold text-board-accent">
                    (you)
                  </span>
                )}
              </p>
              <p
                className="mt-0.5 text-sm font-bold text-board-accent"
                title={basisLabel}
              >
                {formatPercentile(entry.percentile)}
              </p>

              <div
                className={`relative mt-4 flex w-full items-center justify-center overflow-hidden rounded-t-xl ${style.block}`}
              >
                <span className={`font-bold ${style.numeral}`}>
                  {entry.rank ?? place}
                </span>
                <span
                  aria-hidden
                  className={`absolute inset-0 bg-gradient-to-t to-transparent ${style.veil}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-admin-subtle">{basisLabel}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * SUBJECT TOPPERS                                                     *
 * ------------------------------------------------------------------ */

/**
 * Subjects come from each institute's own taxonomy, so the design's fixed
 * physics-purple / chemistry-blue / biology-green mapping cannot simply be
 * hardcoded. Recognised subjects keep the design's colour and icon; anything
 * else cycles this same palette by position, so a card is always styled and
 * two adjacent cards never collide.
 */
const ACCENTS = [
  {
    ring: "border-purple-200",
    chip: "bg-purple-100 text-purple-600",
    label: "text-purple-600",
    score: "text-purple-700",
  },
  {
    ring: "border-blue-200",
    chip: "bg-blue-100 text-blue-600",
    label: "text-blue-600",
    score: "text-blue-700",
  },
  {
    ring: "border-green-200",
    chip: "bg-green-100 text-green-600",
    label: "text-green-600",
    score: "text-green-700",
  },
  {
    ring: "border-amber-200",
    chip: "bg-amber-100 text-amber-600",
    label: "text-amber-600",
    score: "text-amber-700",
  },
] as const;

const KNOWN: Record<string, { accent: number; Icon: typeof AtomIcon }> = {
  physics: { accent: 0, Icon: AtomIcon },
  chemistry: { accent: 1, Icon: FlaskIcon },
  biology: { accent: 2, Icon: LeafIcon },
  botany: { accent: 2, Icon: LeafIcon },
  zoology: { accent: 2, Icon: LeafIcon },
  maths: { accent: 3, Icon: TargetIcon },
  mathematics: { accent: 3, Icon: TargetIcon },
};

function accentFor(subject: string, index: number) {
  const known = KNOWN[subject.trim().toLowerCase()];
  if (known) return { ...ACCENTS[known.accent], Icon: known.Icon };
  return { ...ACCENTS[index % ACCENTS.length], Icon: BookOpenIcon };
}

export function SubjectToppers({ toppers }: { toppers: SubjectTopper[] }) {
  if (toppers.length === 0) return null;

  return (
    <section aria-label="Subject-wise toppers">
      <h3 className="text-center text-sm font-semibold text-admin-ink">
        Subject-wise Toppers
      </h3>
      <div className="mt-6 flex flex-wrap justify-center gap-6">
        {toppers.map((t, i) => {
          const accent = accentFor(t.subject, i);
          const Icon = accent.Icon;
          return (
            <article
              key={t.sectionId}
              className={`flex w-full max-w-[303px] flex-col items-center rounded-xl border bg-board-surface p-6 shadow-[0_1px_1px_rgba(0,0,0,0.05)] sm:w-[303px] ${accent.ring}`}
            >
              <span
                className={`flex size-16 items-center justify-center rounded-full ${accent.chip}`}
              >
                <Icon className="size-6" />
              </span>
              <p
                className={`mt-4 text-center text-sm uppercase tracking-[0.8px] ${accent.label}`}
              >
                {t.subject} topper
              </p>
              <p className="mt-2 text-center text-sm font-semibold text-admin-ink">
                {t.student}
              </p>
              <p className={`mt-1 text-lg font-bold ${accent.score}`}>
                {t.score}
                {t.maxScore !== null && (
                  <span className="font-semibold">/{t.maxScore}</span>
                )}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * RANKED TABLE                                                        *
 * ------------------------------------------------------------------ */

export function RankedTable({
  rows,
  truncated,
  expanded,
  onToggle,
}: {
  rows: LeaderboardEntry[];
  truncated: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      aria-label="Ranked results"
      className="overflow-hidden rounded-xl border border-board-line bg-board-surface shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
    >
      {/* Wide content scrolls inside its own box; the page never scrolls
          sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-board-line bg-board-head text-left">
              <th className="w-20 px-6 py-4 font-bold text-admin-muted">
                Rank
              </th>
              <th className="px-6 py-4 font-bold text-admin-muted">Student</th>
              <th className="px-6 py-4 text-right font-bold text-admin-muted">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const share = pct(r.totalScore, r.maxScore);
              return (
                <tr
                  key={`${r.rank ?? "x"}-${r.name}-${r.initials}`}
                  className={
                    r.you
                      ? "border-b-2 border-board-accent/20 bg-champion/10"
                      : "border-b border-board-line/70 last:border-b-0"
                  }
                >
                  <td
                    className={`px-6 py-6 ${r.you ? "font-bold text-board-accent" : "text-admin-muted"}`}
                  >
                    {r.rank ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm ${
                          r.you
                            ? "bg-champion-mint text-champion-ink ring-2 ring-board-accent"
                            : "bg-board-line text-admin-muted"
                        }`}
                      >
                        {r.initials}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            r.you
                              ? "font-bold text-board-accent"
                              : "text-admin-ink"
                          }
                        >
                          {r.name}
                        </span>
                        {r.you && (
                          <span className="rounded-full bg-board-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-white">
                            You
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td
                    className={`px-6 py-6 text-right ${r.you ? "font-bold text-board-accent" : "text-admin-ink"}`}
                    title={`${r.totalScore} of ${r.maxScore}`}
                  >
                    {share === null ? "—" : `${share}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {truncated && (
        <div className="border-t border-board-line px-4 py-4 text-center">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-sm font-semibold text-board-accent hover:underline"
          >
            {expanded ? "Show fewer" : "View Full List"}
          </button>
        </div>
      )}
    </section>
  );
}
