/**
 * Chapter-wise weightage for an exam section (client request: "40% from Human
 * Physiology, 20% from Genetics").
 *
 * A blueprint is an informational TARGET stored on the section; scoring never
 * reads it. Everything here is pure so the arithmetic (which mirrors
 * apps/api/src/modules/exams/blueprint.ts) and the target-vs-actual comparison
 * are shared by the builder panel, the pre-flight check and the admin review.
 */

export interface BlueprintItem {
  chapterId: string;
  percent: number;
  count: number;
  /** Current chapter name, attached by the API on read. Never sent back. */
  chapter?: string | null;
}

export interface SectionBlueprint {
  total: number;
  items: BlueprintItem[];
}

/** What the author is typing: text fields, so a half-typed value survives. */
export interface DraftBlueprint {
  total: string;
  items: { chapterId: string; percent: string }[];
}

export const PERCENT_TOLERANCE = 0.01;
export const MAX_BLUEPRINT_TOTAL = 300;

/** Largest-remainder rounding: counts add up to exactly `total`. */
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

/** `n` percents, to two decimals, that add up to exactly 100. */
export function evenSplit(n: number): number[] {
  if (n <= 0) return [];
  const cents = 10000;
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from(
    { length: n },
    (_, i) => (base + (i < extra ? 1 : 0)) / 100,
  );
}

export interface ParsedDraft {
  total: number;
  items: { chapterId: string; percent: number }[];
  /** Sum of the percents, rounded to avoid 33.33 x 3 float noise. */
  sum: number;
  /** Counts per item, same order as `items`. */
  counts: number[];
  /** Why this cannot be saved/picked yet; null when it is good to go. */
  problem: string | null;
}

export function parseDraft(draft: DraftBlueprint): ParsedDraft {
  const total = Math.trunc(Number(draft.total));
  const items = draft.items.map((i) => ({
    chapterId: i.chapterId,
    percent: i.percent.trim() === "" ? 0 : Number(i.percent),
  }));
  const sum = Math.round(items.reduce((a, b) => a + b.percent, 0) * 100) / 100;
  const counts = largestRemainderCounts(
    Number.isFinite(total) ? total : 0,
    items.map((i) => i.percent),
  );

  let problem: string | null = null;
  if (items.length === 0) problem = "Tick at least one chapter.";
  else if (
    items.some(
      (i) => !Number.isFinite(i.percent) || i.percent < 0 || i.percent > 100,
    )
  )
    problem = "Each percentage must be between 0 and 100.";
  else if (!Number.isFinite(total) || total < 1 || total > MAX_BLUEPRINT_TOTAL)
    problem = `Set the number of questions (1 to ${MAX_BLUEPRINT_TOTAL}).`;
  else if (Math.abs(sum - 100) > PERCENT_TOLERANCE)
    problem = `Percentages add up to ${sum}%, they must add up to 100%.`;

  return { total, items, sum, counts, problem };
}

/** The API payload for a draft, or null when it is not valid yet. */
export function draftToPayload(
  draft: DraftBlueprint | null,
): SectionBlueprint | null {
  if (!draft) return null;
  const parsed = parseDraft(draft);
  if (parsed.problem) return null;
  return {
    total: parsed.total,
    items: parsed.items.map((i, idx) => ({
      chapterId: i.chapterId,
      percent: i.percent,
      count: parsed.counts[idx],
    })),
  };
}

export function draftFromBlueprint(
  bp: SectionBlueprint | null | undefined,
): DraftBlueprint | null {
  if (!bp) return null;
  return {
    total: String(bp.total),
    items: bp.items.map((i) => ({
      chapterId: i.chapterId,
      percent: String(i.percent),
    })),
  };
}

/** Strip display-only fields so two blueprints can be compared or sent. */
export function normalizeBlueprint(
  bp: SectionBlueprint | null | undefined,
): SectionBlueprint | null {
  if (!bp) return null;
  return {
    total: bp.total,
    items: bp.items.map((i) => ({
      chapterId: i.chapterId,
      percent: i.percent,
      count: i.count,
    })),
  };
}

export function blueprintsEqual(
  a: SectionBlueprint | null | undefined,
  b: SectionBlueprint | null | undefined,
): boolean {
  return (
    JSON.stringify(normalizeBlueprint(a)) ===
    JSON.stringify(normalizeBlueprint(b))
  );
}

export interface ComparisonRow {
  chapterId: string;
  chapter: string;
  /** False for a chapter that is in the section but was not in the target. */
  planned: boolean;
  targetPercent: number;
  targetCount: number;
  actualCount: number;
  actualPercent: number;
  /** actualCount - targetCount; zero means it matches. */
  delta: number;
}

export interface BlueprintComparison {
  rows: ComparisonRow[];
  targetTotal: number;
  actualTotal: number;
  /** Rows that do not match, biggest gap first. */
  deviations: ComparisonRow[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Target vs what is actually in the section. `names` fills in chapter names
 * for planned chapters that have no questions (nothing else to read a name
 * from).
 */
export function compareBlueprint(
  blueprint: SectionBlueprint,
  actual: { chapterId?: string | null; chapter?: string | null }[],
  names?: ReadonlyMap<string, string>,
): BlueprintComparison {
  const actualCounts = new Map<string, number>();
  const seenNames = new Map<string, string>();
  for (const q of actual) {
    if (!q.chapterId) continue;
    actualCounts.set(q.chapterId, (actualCounts.get(q.chapterId) ?? 0) + 1);
    if (q.chapter) seenNames.set(q.chapterId, q.chapter);
  }
  const actualTotal = actual.length;
  const nameOf = (id: string, fromBlueprint?: string | null) =>
    fromBlueprint ?? names?.get(id) ?? seenNames.get(id) ?? "Unknown chapter";
  const pct = (n: number) =>
    actualTotal === 0 ? 0 : round1((n / actualTotal) * 100);

  const rows: ComparisonRow[] = blueprint.items.map((i) => {
    const count = actualCounts.get(i.chapterId) ?? 0;
    return {
      chapterId: i.chapterId,
      chapter: nameOf(i.chapterId, i.chapter),
      planned: true,
      targetPercent: i.percent,
      targetCount: i.count,
      actualCount: count,
      actualPercent: pct(count),
      delta: count - i.count,
    };
  });
  const planned = new Set(blueprint.items.map((i) => i.chapterId));
  for (const [chapterId, count] of actualCounts) {
    if (planned.has(chapterId)) continue;
    rows.push({
      chapterId,
      chapter: nameOf(chapterId),
      planned: false,
      targetPercent: 0,
      targetCount: 0,
      actualCount: count,
      actualPercent: pct(count),
      delta: count,
    });
  }
  // Questions whose chapter is unknown (older data) still count in the total.
  const untagged = actual.filter((q) => !q.chapterId).length;
  if (untagged > 0) {
    rows.push({
      chapterId: "",
      chapter: "No chapter",
      planned: false,
      targetPercent: 0,
      targetCount: 0,
      actualCount: untagged,
      actualPercent: pct(untagged),
      delta: untagged,
    });
  }

  return {
    rows,
    targetTotal: blueprint.total,
    actualTotal,
    deviations: rows
      .filter((r) => r.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  };
}

/** One line per deviation, for a warning message. */
export function describeDeviations(
  deviations: ComparisonRow[],
  limit = 3,
): string {
  const parts = deviations.slice(0, limit).map((d) => {
    if (!d.planned) return `${d.chapter} has ${d.actualCount} unplanned`;
    return `${d.chapter} has ${d.actualCount} of ${d.targetCount} planned`;
  });
  const more = deviations.length - limit;
  return parts.join("; ") + (more > 0 ? `; and ${more} more` : "");
}
