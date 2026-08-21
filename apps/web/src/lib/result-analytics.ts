/**
 * Result analytics (§2.8) — the maths behind the student result and review
 * screens, kept out of the components so both surfaces report identical
 * numbers and so the rules below are testable and stated in exactly one place.
 *
 * A recurring theme: several inputs are genuinely absent rather than zero.
 * Per-question timing did not exist before it was instrumented, and section
 * `maxScore` was added to `sectionScores` after some results were evaluated.
 * Every function here returns `null` for "not recorded" and never substitutes
 * a 0, because a result screen that claims a candidate answered in 0 seconds
 * is worse than one that admits it does not know.
 */

import type { AttemptResult, ReviewQuestion, SectionScore } from "./student";

/* ------------------------------------------------------------------ *
 * Performance banding                                                  *
 * ------------------------------------------------------------------ */

export type PerformanceBand = "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT";

/**
 * Percentage cut-offs for the headline verdict. One exported constant so an
 * institute that disagrees changes these four lines rather than hunting
 * through components — the "configurable thresholds" seam.
 */
export const PERFORMANCE_THRESHOLDS = {
  /** At or above this percentage → Excellent. */
  excellent: 75,
  /** At or above this percentage → Good. */
  good: 50,
} as const;

export const PERFORMANCE_LABEL: Record<PerformanceBand, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  NEEDS_IMPROVEMENT: "Needs Improvement",
};

export function performanceBand(percentage: number): PerformanceBand {
  if (percentage >= PERFORMANCE_THRESHOLDS.excellent) return "EXCELLENT";
  if (percentage >= PERFORMANCE_THRESHOLDS.good) return "GOOD";
  return "NEEDS_IMPROVEMENT";
}

/* ------------------------------------------------------------------ *
 * Small shared helpers                                                 *
 * ------------------------------------------------------------------ */

/**
 * Score as a percentage of the maximum, clamped at 0.
 *
 * Negative marking can drive a total below zero; "-8%" is arithmetically
 * honest but reads as a bug on a progress bar, so the floor is 0 while the
 * raw score is always displayed alongside it.
 */
export function scorePercentage(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.round((score / maxScore) * 100));
}

/**
 * Accuracy = correct / attempted. Deliberately NOT correct / total: leaving a
 * question blank is not the same mistake as answering it wrongly, and mixing
 * the two hides exactly the thing a candidate needs to see.
 *
 * Returns null when nothing was attempted — there is no accuracy to report.
 */
export function accuracy(correct: number, incorrect: number): number | null {
  const attempted = correct + incorrect;
  if (attempted === 0) return null;
  return Math.round((correct / attempted) * 100);
}

/** `1h 04m 12s`, `4m 12s`, `12s` — trimmed to the largest unit that applies. */
export function formatDurationMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/* ------------------------------------------------------------------ *
 * Section-wise                                                         *
 * ------------------------------------------------------------------ */

export interface SectionPerformance {
  sectionId: string;
  name: string;
  score: number;
  /** Null when this result predates section max-marks being recorded. */
  maxScore: number | null;
  percentage: number | null;
  correct: number;
  incorrect: number;
  unattempted: number;
  attempted: number;
  questionCount: number | null;
  accuracy: number | null;
  /** Null when no section timing was recorded for this attempt. */
  seconds: number | null;
}

export function sectionPerformance(
  sections: SectionScore[] | null,
): SectionPerformance[] {
  if (!sections) return [];
  return sections.map((s) => {
    const attempted = s.correct + s.incorrect;
    const max = typeof s.maxScore === "number" ? s.maxScore : null;
    return {
      sectionId: s.sectionId,
      name: s.name,
      score: s.score,
      maxScore: max,
      percentage: max === null ? null : scorePercentage(s.score, max),
      correct: s.correct,
      incorrect: s.incorrect,
      unattempted: s.unattempted,
      attempted,
      questionCount:
        typeof s.questionCount === "number"
          ? s.questionCount
          : // Derivable when the count itself was not stored: every question
            // lands in exactly one of the three buckets.
            s.correct + s.incorrect + s.unattempted,
      accuracy: accuracy(s.correct, s.incorrect),
      // 0 is a real value here only if timing was reported at all; an attempt
      // sat before instrumentation reports nothing, hence the `?? null`.
      seconds: typeof s.seconds === "number" ? s.seconds : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Subject-wise (derived from the per-question review)                  *
 * ------------------------------------------------------------------ */

export interface SubjectPerformance {
  subject: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  attempted: number;
  questionCount: number;
  score: number;
  maxScore: number;
  percentage: number;
  accuracy: number | null;
}

/**
 * Group the review's questions by their bank subject.
 *
 * Sections and subjects are NOT the same axis — a section is how the paper was
 * assembled ("Section A"), a subject is what the question is about ("Physics").
 * A single-section paper can still span three subjects, which is why this is
 * computed from the questions rather than read off `sectionScores`.
 */
export function subjectPerformance(
  questions: ReviewQuestion[],
): SubjectPerformance[] {
  const bySubject = new Map<string, SubjectPerformance>();

  for (const q of questions) {
    const row = bySubject.get(q.subject) ?? {
      subject: q.subject,
      correct: 0,
      incorrect: 0,
      unattempted: 0,
      attempted: 0,
      questionCount: 0,
      score: 0,
      maxScore: 0,
      percentage: 0,
      accuracy: null,
    };

    row.questionCount += 1;
    row.score += q.marksAwarded;
    // DROPPED questions were removed from scoring, so they carry no obtainable
    // marks — counting them would understate every percentage on this row.
    if (q.status !== "DROPPED") row.maxScore += q.marksCorrect;

    if (q.status === "CORRECT" || q.status === "BONUS") row.correct += 1;
    else if (q.status === "INCORRECT") row.incorrect += 1;
    else if (q.status === "UNATTEMPTED") row.unattempted += 1;

    bySubject.set(q.subject, row);
  }

  return [...bySubject.values()]
    .map((row) => ({
      ...row,
      attempted: row.correct + row.incorrect,
      percentage: scorePercentage(row.score, row.maxScore),
      accuracy: accuracy(row.correct, row.incorrect),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

/* ------------------------------------------------------------------ *
 * Question status breakdown                                            *
 * ------------------------------------------------------------------ */

export interface StatusBreakdown {
  correct: number;
  incorrect: number;
  /** Opened and left blank — a decision, unlike `notVisited`. */
  skipped: number;
  /** Never navigated to at all. */
  notVisited: number;
  markedForReview: number;
  bonus: number;
  dropped: number;
  total: number;
}

export function statusBreakdown(questions: ReviewQuestion[]): StatusBreakdown {
  const out: StatusBreakdown = {
    correct: 0,
    incorrect: 0,
    skipped: 0,
    notVisited: 0,
    markedForReview: 0,
    bonus: 0,
    dropped: 0,
    total: questions.length,
  };

  for (const q of questions) {
    if (q.status === "CORRECT") out.correct += 1;
    else if (q.status === "INCORRECT") out.incorrect += 1;
    else if (q.status === "BONUS") out.bonus += 1;
    else if (q.status === "DROPPED") out.dropped += 1;
    else if (q.visited) out.skipped += 1;
    else out.notVisited += 1;

    // Counted independently: a question can be both answered and flagged.
    if (q.markedForReview) out.markedForReview += 1;
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Negative marking                                                     *
 * ------------------------------------------------------------------ */

export interface NegativeMarkingAnalysis {
  /** Total marks lost to wrong answers, as a POSITIVE magnitude. */
  marksLost: number;
  /** How many questions did the losing. */
  incorrectCount: number;
  /** What the score would have been with no negative marking. */
  scoreWithoutPenalty: number;
  /** Share of obtainable marks surrendered to penalties. */
  percentageOfMax: number;
}

export function negativeMarkingAnalysis(
  questions: ReviewQuestion[],
  totalScore: number,
  maxScore: number,
): NegativeMarkingAnalysis {
  let marksLost = 0;
  let incorrectCount = 0;

  for (const q of questions) {
    // Read the awarded figure rather than re-deriving from `marksWrong`: a
    // MANUAL award can be negative too, and the server is the authority on
    // what was actually deducted.
    if (q.status === "INCORRECT" && q.marksAwarded < 0) {
      marksLost += Math.abs(q.marksAwarded);
      incorrectCount += 1;
    }
  }

  return {
    marksLost,
    incorrectCount,
    scoreWithoutPenalty: totalScore + marksLost,
    percentageOfMax:
      maxScore > 0 ? Math.round((marksLost / maxScore) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Time analysis                                                        *
 * ------------------------------------------------------------------ */

export interface TimeAnalysis {
  /** Wall-clock from start to submit. Null if the attempt never submitted. */
  totalMs: number | null;
  /** Mean over questions that HAVE a recorded time, not over all questions. */
  averageMsPerQuestion: number | null;
  fastest: { number: number; ms: number } | null;
  slowest: { number: number; ms: number } | null;
  /** Above this counts as "slow" — see {@link SLOW_QUESTION_FACTOR}. */
  slowThresholdMs: number | null;
  /** How many questions carry a recorded time at all. */
  timedCount: number;
  /** True when nothing was recorded, so the UI can say so plainly. */
  unavailable: boolean;
}

/**
 * A question counts as "slow" past this multiple of the median time.
 *
 * The MEDIAN, not the mean: one question a candidate sat on for ten minutes
 * drags a mean far enough that genuinely slow questions stop clearing it, and
 * the outlier is precisely what the filter should surface.
 */
export const SLOW_QUESTION_FACTOR = 1.5;

export function timeAnalysis(
  questions: ReviewQuestion[],
  startedAt: string | null,
  submittedAt: string | null,
): TimeAnalysis {
  const timed = questions.filter(
    (q): q is ReviewQuestion & { timeSpentMs: number } =>
      typeof q.timeSpentMs === "number" && q.timeSpentMs > 0,
  );

  const totalMs =
    startedAt && submittedAt
      ? Math.max(
          0,
          new Date(submittedAt).getTime() - new Date(startedAt).getTime(),
        )
      : null;

  if (timed.length === 0) {
    return {
      totalMs,
      averageMsPerQuestion: null,
      fastest: null,
      slowest: null,
      slowThresholdMs: null,
      timedCount: 0,
      unavailable: true,
    };
  }

  const sorted = [...timed].sort((a, b) => a.timeSpentMs - b.timeSpentMs);
  const sum = timed.reduce((n, q) => n + q.timeSpentMs, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1].timeSpentMs + sorted[mid].timeSpentMs) / 2
      : sorted[mid].timeSpentMs;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    totalMs,
    averageMsPerQuestion: Math.round(sum / timed.length),
    fastest: { number: first.number, ms: first.timeSpentMs },
    slowest: { number: last.number, ms: last.timeSpentMs },
    slowThresholdMs: Math.round(median * SLOW_QUESTION_FACTOR),
    timedCount: timed.length,
    unavailable: false,
  };
}

/** Whether one question clears the "slow" bar computed above. */
export function isSlowQuestion(
  q: ReviewQuestion,
  slowThresholdMs: number | null,
): boolean {
  if (slowThresholdMs === null || typeof q.timeSpentMs !== "number") {
    return false;
  }
  return q.timeSpentMs > slowThresholdMs;
}

/* ------------------------------------------------------------------ *
 * Headline summary                                                     *
 * ------------------------------------------------------------------ */

export interface ResultSummary {
  percentage: number;
  band: PerformanceBand;
  /** Null when the paper defines no pass mark — not the same as "failed". */
  passed: boolean | null;
  attempted: number;
  totalQuestions: number;
  accuracy: number | null;
}

export function resultSummary(result: AttemptResult): ResultSummary {
  const attempted = result.correctCount + result.incorrectCount;
  const percentage = scorePercentage(result.totalScore, result.maxScore);

  return {
    percentage,
    band: performanceBand(percentage),
    passed:
      result.exam.passingMarks === null
        ? null
        : result.totalScore >= result.exam.passingMarks,
    attempted,
    totalQuestions: attempted + result.unattemptedCount,
    accuracy: accuracy(result.correctCount, result.incorrectCount),
  };
}
