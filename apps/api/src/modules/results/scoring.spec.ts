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
