import { QuestionType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';

/**
 * Whether a candidate's answer matches the answer key for a question type.
 * MCQ = string equality; INTEGER = numeric equality; MSQ = set equality of the
 * chosen option keys. Shared by result evaluation (§2.8) and item analysis
 * (§2.15) so both score identically.
 */
export function isCorrect(
  type: QuestionType,
  answer: Prisma.JsonValue,
  key: Prisma.JsonValue,
): boolean {
  if (type === QuestionType.MCQ) {
    return typeof answer === 'string' && answer === key;
  }
  if (type === QuestionType.INTEGER) {
    return (
      typeof answer !== 'object' &&
      answer !== null &&
      Number(answer) === Number(key)
    );
  }
  // MSQ — set equality of option keys.
  if (!Array.isArray(answer) || !Array.isArray(key)) return false;
  const a = answer.map(String).sort();
  const k = key.map(String).sort();
  return a.length === k.length && a.every((v, i) => v === k[i]);
}

/**
 * Standard competition ranking ("1224"): equal scores share a rank, and the next
 * distinct score skips the ranks consumed by the tie.
 *
 * O(n log n) — one sort and one pass. The naive shape (for each candidate, count
 * how many outscored them) is O(n²): ~75M comparisons for a 5,000-candidate
 * exam, and it is run once for the cohort and again for every batch.
 */
export function assignCompetitionRanks<T extends { totalScore: number }>(
  group: readonly T[],
  assign: (item: T, rank: number) => void,
): void {
  const descending = [...group].sort((a, b) => b.totalScore - a.totalScore);
  let rank = 0;
  descending.forEach((item, index) => {
    if (index === 0 || item.totalScore !== descending[index - 1].totalScore) {
      rank = index + 1;
    }
    assign(item, rank);
  });
}

/**
 * NTA-style percentile: the share of the cohort scoring at or below each
 * candidate. Sorting ascending, the LAST index holding a given score is exactly
 * the count of candidates scoring <= it.
 */
export function percentilesByScore(
  scores: readonly number[],
): Map<number, number> {
  const n = scores.length;
  const ascending = [...scores].sort((a, b) => a - b);
  const atOrBelow = new Map<number, number>();
  ascending.forEach((score, i) => atOrBelow.set(score, i + 1));

  const percentiles = new Map<number, number>();
  for (const [score, count] of atOrBelow) {
    percentiles.set(score, n > 0 ? (count / n) * 100 : 0);
  }
  return percentiles;
}
