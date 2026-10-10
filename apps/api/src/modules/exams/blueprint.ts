/**
 * Chapter-wise weightage helpers. Pure and dependency-free so the arithmetic
 * (which the web builder mirrors) can be tested without a database.
 */

/** Tolerance when checking that percents add up to 100. */
export const PERCENT_TOLERANCE = 0.01;

/**
 * Turn percents into whole question counts that add up to exactly `total`
 * (largest-remainder / Hamilton method): everyone gets the floor of their
 * quota, then the leftover seats go to the biggest fractional remainders.
 * Ties go to the earlier item so the result is stable.
 *
 * Percents are normalised by their own sum, so 33.33 x 3 still yields `total`.
 */
export function largestRemainderCounts(
  total: number,
  percents: readonly number[],
): number[] {
  const sum = percents.reduce((a, b) => a + b, 0);
  if (percents.length === 0 || total <= 0 || sum <= 0) {
    return percents.map(() => 0);
  }
  const quotas = percents.map((p) => (Math.max(0, p) / sum) * total);
  const counts = quotas.map((q) => Math.floor(q + 1e-9));
  let remaining = total - counts.reduce((a, b) => a + b, 0);
  const order = quotas
    .map((q, i) => ({ i, rem: q - counts[i] }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (
    let k = 0;
    remaining > 0 && order.length > 0;
    k = (k + 1) % order.length
  ) {
    counts[order[k].i] += 1;
    remaining -= 1;
  }
  return counts;
}

export function percentsSumToHundred(percents: readonly number[]): boolean {
  const sum = percents.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) <= PERCENT_TOLERANCE;
}

/** Small deterministic PRNG (mulberry32) so tests can pin a shuffle. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates; returns a new array. */
export function shuffled<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface BlueprintPickItem {
  chapterId: string;
  percent: number;
}

export interface BlueprintPickPlan {
  /** question ids chosen per chapter, in item order */
  picked: { chapterId: string; questionIds: string[] }[];
  counts: {
    chapterId: string;
    percent: number;
    wanted: number;
    picked: number;
    available: number;
  }[];
  shortfalls: { chapterId: string; wanted: number; available: number }[];
}

/**
 * Decide which questions to take. `candidates` maps a chapter id to the ids of
 * every eligible question in it. A chapter with fewer questions than its quota
 * yields what exists and a shortfall; nothing is redistributed to other
 * chapters, because that would silently change the teacher's weightage.
 */
export function planBlueprintPick(
  total: number,
  items: readonly BlueprintPickItem[],
  candidates: ReadonlyMap<string, readonly string[]>,
  random: () => number = Math.random,
): BlueprintPickPlan {
  const wantedCounts = largestRemainderCounts(
    total,
    items.map((i) => i.percent),
  );
  const picked: BlueprintPickPlan['picked'] = [];
  const counts: BlueprintPickPlan['counts'] = [];
  const shortfalls: BlueprintPickPlan['shortfalls'] = [];

  items.forEach((item, idx) => {
    const pool = candidates.get(item.chapterId) ?? [];
    const wanted = wantedCounts[idx];
    const chosen = shuffled(pool, random).slice(0, wanted);
    picked.push({ chapterId: item.chapterId, questionIds: chosen });
    counts.push({
      chapterId: item.chapterId,
      percent: item.percent,
      wanted,
      picked: chosen.length,
      available: pool.length,
    });
    if (chosen.length < wanted) {
      shortfalls.push({
        chapterId: item.chapterId,
        wanted,
        available: pool.length,
      });
    }
  });

  return { picked, counts, shortfalls };
}
