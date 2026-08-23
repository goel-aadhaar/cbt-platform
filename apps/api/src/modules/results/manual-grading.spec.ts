/**
 * The rules that make manual evaluation safe to hand to a grader.
 *
 * Manual marks are the one place in scoring where a human number goes straight
 * into a candidate's total, so each guard here is protecting against a
 * different way of quietly awarding the wrong thing: marks above the paper's
 * ceiling, marks on a question that is not actually graded by hand (and so will
 * be overwritten at the next evaluation), and a request naming a candidate the
 * grader is not allowed to see.
 */

type Scoring = 'NORMAL' | 'BONUS' | 'DROPPED' | 'MANUAL';

interface Award {
  attemptId: string;
  marks: number;
}

/** Mirrors the ceiling ResultsService.setManualScores grades against. */
function maxMarksFor(
  sectionMarksCorrect: number | null,
  questionMarks: number,
) {
  // The section's marks win: an exam can re-mark a question when it attaches
  // it, and grading against the question's own default would let a candidate
  // score more on it than the paper allows.
  return sectionMarksCorrect ?? questionMarks;
}

/** Mirrors the range check. */
function outOfRange(awards: Award[], max: number): Award[] {
  return awards.filter((a) => a.marks > max || a.marks < 0);
}

/** Mirrors the "is this question actually manual" guard. */
function rejectsNonManual(scoring: Scoring): boolean {
  return scoring !== 'MANUAL';
}

/**
 * Mirrors the set-based scope check: every named attempt must resolve within
 * the exam AND the caller's batches, or the whole request is refused.
 */
function allInScope(
  requested: string[],
  visible: string[],
): { accepted: boolean; missing: number } {
  const found = requested.filter((id) => visible.includes(id));
  return {
    accepted: found.length === requested.length,
    missing: requested.length - found.length,
  };
}

describe('the marks ceiling', () => {
  it("uses the section's marks when the exam re-marked the question", () => {
    expect(maxMarksFor(2, 4)).toBe(2);
  });

  it("falls back to the question's own marks when the section sets none", () => {
    expect(maxMarksFor(null, 4)).toBe(4);
  });

  it('accepts a full-marks award and a zero award', () => {
    expect(outOfRange([{ attemptId: 'a', marks: 4 }], 4)).toEqual([]);
    expect(outOfRange([{ attemptId: 'a', marks: 0 }], 4)).toEqual([]);
  });

  it('refuses more marks than the question is worth', () => {
    // The case that matters: 5 on a 4-mark question puts a candidate above the
    // paper's maximum, which corrupts percentiles for everyone else too.
    const bad = outOfRange(
      [
        { attemptId: 'a', marks: 4 },
        { attemptId: 'b', marks: 5 },
      ],
      4,
    );
    expect(bad.map((a) => a.attemptId)).toEqual(['b']);
  });

  it('refuses negative marks', () => {
    expect(outOfRange([{ attemptId: 'a', marks: -1 }], 4)).toHaveLength(1);
  });

  it('grades against the section ceiling, not the question default', () => {
    // A 4-mark question attached to a 2-mark section: 3 must be refused even
    // though the question alone would allow it.
    const max = maxMarksFor(2, 4);
    expect(outOfRange([{ attemptId: 'a', marks: 3 }], max)).toHaveLength(1);
  });
});

describe('grading a question that is not set to MANUAL', () => {
  it('is refused for NORMAL, BONUS and DROPPED', () => {
    // Not pedantry: those three are scored from the key or a blanket rule, so
    // the next evaluation would silently discard whatever was awarded here.
    expect(rejectsNonManual('NORMAL')).toBe(true);
    expect(rejectsNonManual('BONUS')).toBe(true);
    expect(rejectsNonManual('DROPPED')).toBe(true);
  });

  it('is allowed for MANUAL', () => {
    expect(rejectsNonManual('MANUAL')).toBe(false);
  });
});

describe('who may be graded', () => {
  it('accepts a request naming only in-scope candidates', () => {
    expect(allInScope(['a1', 'a2'], ['a1', 'a2', 'a3'])).toEqual({
      accepted: true,
      missing: 0,
    });
  });

  it('refuses the WHOLE request when one candidate is out of scope', () => {
    // Rejected whole rather than partially applied: a half-written batch of
    // awards followed by a re-evaluation is worse than no awards at all,
    // because the totals then look deliberate.
    expect(allInScope(['a1', 'stranger'], ['a1', 'a2'])).toEqual({
      accepted: false,
      missing: 1,
    });
  });

  it('counts a duplicated attempt id once', () => {
    // The service de-duplicates before counting; without that, two awards for
    // the same candidate would fail the length comparison and refuse a
    // perfectly legitimate request.
    const requested = [...new Set(['a1', 'a1'])];
    expect(allInScope(requested, ['a1'])).toEqual({
      accepted: true,
      missing: 0,
    });
  });
});

/**
 * Mirrors the drawer's "what actually changed" calculation — the client sends
 * only the rows a grader touched.
 */
function pendingAwards(
  items: { attemptId: string; awarded: number | null }[],
  draft: Record<string, string>,
): Award[] {
  return items.flatMap((i) => {
    const raw = draft[i.attemptId];
    if (raw === undefined || raw.trim() === '') return [];
    const marks = Number(raw);
    if (!Number.isFinite(marks)) return [];
    if (i.awarded !== null && i.awarded === marks) return [];
    return [{ attemptId: i.attemptId, marks }];
  });
}

describe('what the grader actually submits', () => {
  const items = [
    { attemptId: 'a1', awarded: null },
    { attemptId: 'a2', awarded: 2 },
    { attemptId: 'a3', awarded: null },
  ];

  it('sends a newly entered mark', () => {
    expect(pendingAwards(items, { a1: '3' })).toEqual([
      { attemptId: 'a1', marks: 3 },
    ]);
  });

  it('sends an explicit zero — it is a grade, not a blank', () => {
    // The trap: treating 0 as "nothing entered" would make it impossible to
    // record that a candidate earned no marks, leaving them permanently
    // "ungraded" while scoring zero anyway.
    expect(pendingAwards(items, { a1: '0' })).toEqual([
      { attemptId: 'a1', marks: 0 },
    ]);
  });

  it('skips a row left blank', () => {
    expect(pendingAwards(items, { a1: '', a3: '   ' })).toEqual([]);
  });

  it('skips a row re-typed to the same mark it already has', () => {
    expect(pendingAwards(items, { a2: '2' })).toEqual([]);
  });

  it('sends a row whose existing mark was edited', () => {
    expect(pendingAwards(items, { a2: '4' })).toEqual([
      { attemptId: 'a2', marks: 4 },
    ]);
  });

  it('ignores text that is not a number', () => {
    expect(pendingAwards(items, { a1: 'full' })).toEqual([]);
  });
});
