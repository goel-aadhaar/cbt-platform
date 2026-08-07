import { QuestionType } from '../../generated/prisma/enums';
import { isCorrect } from './scoring';

/**
 * Scoring is the single most correctness-critical function on the platform — it
 * decides every candidate's marks. Both the Result engine (§2.8) and item
 * analysis (§2.15) call it, so it is tested exhaustively per question type.
 */
describe('isCorrect', () => {
  describe('MCQ (single correct option key)', () => {
    it('accepts the exact key', () => {
      expect(isCorrect(QuestionType.MCQ, 'A', 'A')).toBe(true);
    });

    it('rejects a different key', () => {
      expect(isCorrect(QuestionType.MCQ, 'B', 'A')).toBe(false);
    });

    it('is case-sensitive (keys are normalised upstream)', () => {
      expect(isCorrect(QuestionType.MCQ, 'a', 'A')).toBe(false);
    });

    it('rejects a non-string answer', () => {
      expect(isCorrect(QuestionType.MCQ, 1, 'A')).toBe(false);
      expect(isCorrect(QuestionType.MCQ, ['A'], 'A')).toBe(false);
      expect(isCorrect(QuestionType.MCQ, null, 'A')).toBe(false);
    });
  });

  describe('INTEGER (numeric equality)', () => {
    it('accepts an equal number', () => {
      expect(isCorrect(QuestionType.INTEGER, 7, 7)).toBe(true);
    });

    it('accepts a numeric string (client may send "7")', () => {
      expect(isCorrect(QuestionType.INTEGER, '7', 7)).toBe(true);
    });

    it('treats 7.0 and 7 as equal', () => {
      expect(isCorrect(QuestionType.INTEGER, 7.0, 7)).toBe(true);
    });

    it('rejects a different number', () => {
      expect(isCorrect(QuestionType.INTEGER, 8, 7)).toBe(false);
    });

    it('rejects null / objects / arrays', () => {
      expect(isCorrect(QuestionType.INTEGER, null, 7)).toBe(false);
      expect(isCorrect(QuestionType.INTEGER, [7], 7)).toBe(false);
      expect(isCorrect(QuestionType.INTEGER, { v: 7 }, 7)).toBe(false);
    });

    it('rejects a non-numeric string rather than coercing to NaN==NaN', () => {
      expect(isCorrect(QuestionType.INTEGER, 'seven', 7)).toBe(false);
    });
  });

  describe('MSQ (set equality of option keys)', () => {
    it('accepts the same keys in the same order', () => {
      expect(isCorrect(QuestionType.MSQ, ['A', 'C'], ['A', 'C'])).toBe(true);
    });

    it('accepts the same keys in a different order', () => {
      expect(isCorrect(QuestionType.MSQ, ['C', 'A'], ['A', 'C'])).toBe(true);
    });

    it('rejects a partial selection', () => {
      expect(isCorrect(QuestionType.MSQ, ['A'], ['A', 'C'])).toBe(false);
    });

    it('rejects a superset selection', () => {
      expect(isCorrect(QuestionType.MSQ, ['A', 'B', 'C'], ['A', 'C'])).toBe(
        false,
      );
    });

    it('rejects an empty selection', () => {
      expect(isCorrect(QuestionType.MSQ, [], ['A', 'C'])).toBe(false);
    });

    it('rejects a non-array answer', () => {
      expect(isCorrect(QuestionType.MSQ, 'A', ['A'])).toBe(false);
      expect(isCorrect(QuestionType.MSQ, null, ['A'])).toBe(false);
    });
  });
});

/** Ranks decide who tops the merit list, so ties are tested explicitly. */
describe('assignCompetitionRanks', () => {
  const rank = (scores: number[]): number[] => {
    const items = scores.map((totalScore) => ({ totalScore, rank: 0 }));
    assignCompetitionRanks(items, (item, r) => {
      item.rank = r;
    });
    return items.map((i) => i.rank);
  };

  it('ranks distinct scores highest-first', () => {
    expect(rank([8, 3, 0])).toEqual([1, 2, 3]);
  });

  it('does not depend on input order', () => {
    expect(rank([0, 8, 3])).toEqual([3, 1, 2]);
  });

  it('gives tied candidates the same rank and skips the consumed ranks (1224)', () => {
    // Two candidates tie for 2nd; the next candidate is 4th, not 3rd.
    expect(rank([10, 8, 8, 5])).toEqual([1, 2, 2, 4]);
  });

  it('handles a tie at the top', () => {
    expect(rank([9, 9, 4])).toEqual([1, 1, 3]);
  });

  it('gives everyone rank 1 when all scores are equal', () => {
    expect(rank([5, 5, 5])).toEqual([1, 1, 1]);
  });

  it('ranks negative scores (negative marking can take a candidate below zero)', () => {
    expect(rank([2, -1, -4])).toEqual([1, 2, 3]);
  });

  it('is a no-op on an empty cohort', () => {
    expect(rank([])).toEqual([]);
  });
});

describe('percentilesByScore', () => {
  it('gives the top scorer 100 and scales by candidates at-or-below', () => {
    const p = percentilesByScore([8, 3, 0]);
    expect(p.get(8)).toBeCloseTo(100, 5);
    expect(p.get(3)).toBeCloseTo(66.667, 2);
    expect(p.get(0)).toBeCloseTo(33.333, 2);
  });

  it('gives tied candidates the same percentile, counting the whole tie', () => {
    // Each 8 has all four candidates at or below it (itself, its tied peer, the
    // 5 and the 1) → 100. Joint toppers both score the 100th percentile, which
    // is the NTA convention.
    const p = percentilesByScore([8, 8, 5, 1]);
    expect(p.get(8)).toBeCloseTo(100, 5);
    expect(p.get(5)).toBeCloseTo(50, 5);
    expect(p.get(1)).toBeCloseTo(25, 5);
  });

  it('gives a sole candidate 100', () => {
    expect(percentilesByScore([7]).get(7)).toBeCloseTo(100, 5);
  });

  it('returns an empty map for an empty cohort', () => {
    expect(percentilesByScore([]).size).toBe(0);
  });
});
