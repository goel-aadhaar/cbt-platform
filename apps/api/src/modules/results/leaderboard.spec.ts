/**
 * What the leaderboard is allowed to say about other people.
 *
 * This is the only student-facing payload in the app that names candidates
 * other than the caller, so the rules below are not presentation details — they
 * are the reason the screen is publishable at all. Each one is pinned here
 * because breaking any of them turns a ranking into a published list of
 * individuals' results.
 */

/** Mirrors `abbreviateName` in results.service.ts. */
function abbreviateName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Mirrors `initialsOf`. */
function initialsOf(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Mirrors the caller-vs-peer naming decision. */
function displayName(full: string, isCaller: boolean): string {
  return isCaller ? full : abbreviateName(full);
}

const COHORT_MIN = 5;

/** Mirrors the suppression gate. */
function isSuppressed(cohortSize: number): boolean {
  return cohortSize < COHORT_MIN;
}

/** Mirrors the clamp applied to the `limit` query parameter. */
function clampLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 3), 100)
    : 10;
}

describe('how a peer is named', () => {
  it('gives a surname initial, never the surname', () => {
    expect(abbreviateName('Priya Sharma')).toBe('Priya S.');
  });

  it('abbreviates the LAST name when there is a middle name', () => {
    // "Akash Kumar Verma" must not become "Akash K." — the surname is what
    // identifies someone in a roster, so it is the part that gets cut.
    expect(abbreviateName('Akash Kumar Verma')).toBe('Akash V.');
  });

  it('leaves a single-word name alone', () => {
    // Nothing to abbreviate. Truncating it would just render a wrong name.
    expect(abbreviateName('Gauri')).toBe('Gauri');
  });

  it('survives untidy whitespace', () => {
    expect(abbreviateName('  Neha   Mishra  ')).toBe('Neha M.');
  });

  it('never returns the full name for a peer', () => {
    const full = 'Sneha Joshi';
    expect(displayName(full, false)).not.toBe(full);
    expect(displayName(full, false)).toBe('Sneha J.');
  });

  it('returns the full name for the caller, and only the caller', () => {
    // The caller's own row has to be findable, and it is their own result.
    expect(displayName('Sneha Joshi', true)).toBe('Sneha Joshi');
  });
});

describe('initials', () => {
  it('takes first and last for a two-part name', () => {
    expect(initialsOf('Akash Verma')).toBe('AV');
  });

  it('skips the middle name', () => {
    expect(initialsOf('Akash Kumar Verma')).toBe('AV');
  });

  it('falls back to two letters for a single-word name', () => {
    expect(initialsOf('Gauri')).toBe('GA');
  });

  it('does not throw on an empty name', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('suppression for a small cohort', () => {
  it('withholds the board below the minimum', () => {
    // With four candidates, "rank 2 scored 88%" identifies a person however it
    // is labelled — the same reason the cohort-average panel is suppressed.
    for (const n of [0, 1, 2, 3, 4]) {
      expect(isSuppressed(n)).toBe(true);
    }
  });

  it('allows it at the minimum and above', () => {
    expect(isSuppressed(5)).toBe(false);
    expect(isSuppressed(240)).toBe(false);
  });
});

describe('the row limit', () => {
  it('defaults when absent or unparseable', () => {
    expect(clampLimit(undefined)).toBe(10);
    expect(clampLimit('full-list-please')).toBe(10);
  });

  it('caps an oversized request', () => {
    // The guard that stops one request asking for every candidate's row.
    expect(clampLimit('99999')).toBe(100);
  });

  it('raises an absurdly small request to something showable', () => {
    expect(clampLimit('0')).toBe(3);
    expect(clampLimit('-20')).toBe(3);
  });

  it('honours a sensible request', () => {
    expect(clampLimit('25')).toBe(25);
  });

  it('truncates a fractional request rather than rejecting it', () => {
    expect(clampLimit('12.9')).toBe(12);
  });
});

/**
 * Mirrors the "append the caller's own row" rule: a candidate who placed
 * outside the visible slice still has to be able to see where they came.
 */
function visibleRows<T extends { you: boolean }>(all: T[], limit: number): T[] {
  const top = all.slice(0, limit);
  const me = all.find((e) => e.you);
  return me && !top.some((e) => e.you) ? [...top, me] : top;
}

describe('the caller can always find themselves', () => {
  const cohort = [
    { rank: 1, you: false },
    { rank: 2, you: false },
    { rank: 3, you: false },
    { rank: 4, you: false },
    { rank: 5, you: true },
  ];

  it('appends their row when they placed outside the slice', () => {
    expect(visibleRows(cohort, 3).map((r) => r.rank)).toEqual([1, 2, 3, 5]);
  });

  it('does not duplicate their row when they are already in it', () => {
    // The trap: appending unconditionally puts the top-ranked caller on the
    // board twice.
    const topCaller = [
      { rank: 1, you: true },
      { rank: 2, you: false },
      { rank: 3, you: false },
    ];
    expect(visibleRows(topCaller, 3).filter((r) => r.you)).toHaveLength(1);
  });
});

/** Mirrors the per-section stripping applied to peer rows. */
function stripPeerSections<T extends { you: boolean; sections: unknown[] }>(
  rows: T[],
): T[] {
  return rows.map((r) => (r.you ? r : { ...r, sections: [] }));
}

describe('per-section detail', () => {
  it('is kept for the caller and removed for everyone else', () => {
    // The board shows section scores only for the champion and the subject
    // cards, both computed server-side — so a peer's per-subject breakdown has
    // no reason to be on the wire.
    const rows = [
      { you: true, sections: [{ name: 'Physics' }] },
      { you: false, sections: [{ name: 'Physics' }] },
    ];
    expect(stripPeerSections(rows).map((r) => r.sections.length)).toEqual([
      1, 0,
    ]);
  });
});

/**
 * Mirrors `percentilesByScore` in scoring.ts — the SAME function the leaderboard
 * calls for a batch-scoped board and that `evaluate` calls for the stored
 * institute-wide one. Reproduced here so the expectations below can be read as
 * arithmetic.
 */
function percentilesByScore(scores: readonly number[]): Map<number, number> {
  const n = scores.length;
  const ascending = [...scores].sort((a, b) => a - b);
  const atOrBelow = new Map<number, number>();
  ascending.forEach((score, i) => atOrBelow.set(score, i + 1));
  const out = new Map<number, number>();
  for (const [score, count] of atOrBelow) {
    out.set(score, n > 0 ? (count / n) * 100 : 0);
  }
  return out;
}

/** Mirrors the leaderboard's choice of which percentile to report. */
function percentileFor(
  scope: 'OVERALL' | 'BATCH',
  storedPercentile: number | null,
  totalScore: number,
  cohortScores: readonly number[],
): number | null {
  if (scope === 'OVERALL') return storedPercentile;
  return percentilesByScore(cohortScores).get(totalScore) ?? null;
}

describe('which cohort the percentile counts', () => {
  // The fixture's shape: nine candidates overall, six of them in one batch.
  const overall = [2, 3, 6, 9, 10, 12, 14, 15, 16];
  const batch = [3, 6, 10, 14, 15, 16];
  const round1 = (n: number | null) =>
    n === null ? null : Math.round(n * 10) / 10;

  it('reports the STORED percentile for an institute-wide board', () => {
    // Overall must keep the stored value so the board agrees with the number on
    // the candidate's own result page.
    expect(percentileFor('OVERALL', 88.9, 15, overall)).toBe(88.9);
  });

  it('recounts against the batch for a batch-scoped board', () => {
    // 15 marks is 5th-lowest of six in the batch -> 5/6.
    expect(round1(percentileFor('BATCH', 88.9, 15, batch))).toBe(83.3);
  });

  it('ignores the stored value entirely when scoped to a batch', () => {
    // The bug this replaced: showing 88.9 (counted over nine) beside a rank
    // counted over six, so one row described two different cohorts.
    expect(round1(percentileFor('BATCH', 88.9, 15, batch))).not.toBe(88.9);
  });

  it('puts the best score of either cohort at exactly 100', () => {
    expect(percentileFor('BATCH', 100, 16, batch)).toBe(100);
    expect(round1(percentilesByScore(overall).get(16) ?? null)).toBe(100);
  });

  it('gives tied scores the same percentile', () => {
    // Percentile is keyed by score, so a tie cannot separate two candidates.
    const withTie = [3, 10, 10, 16];
    const p = percentilesByScore(withTie);
    expect(p.get(10)).toBe(75); // three of four score at or below 10
  });

  it('moves a mid-table candidate down when the batch is the tougher cohort', () => {
    // Ishaan: 14 marks. 7/9 overall, but only 4/6 among his own batch.
    expect(round1(percentileFor('OVERALL', 77.8, 14, overall))).toBe(77.8);
    expect(round1(percentileFor('BATCH', 77.8, 14, batch))).toBe(66.7);
  });

  it('returns null rather than 0 for a score absent from the cohort', () => {
    // A score that is not in the list cannot be given a percentile; 0 would be
    // a real percentile and would read as "bottom of the cohort".
    expect(percentileFor('BATCH', 50, 99, batch)).toBeNull();
  });
});
