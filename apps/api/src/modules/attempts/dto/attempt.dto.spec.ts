import { validateAnswer } from './attempt.dto';

/**
 * DEF-003 (QA 2026-09-21): `PUT /attempts/:id/responses/:questionId` accepted
 * `{answer: {x: 1}}` with 200 OK — `SaveResponseDto.answer` has no
 * class-validator decorator (it can't: the union type differs per question
 * type), so a malformed body reached the DB unvalidated. This pins the
 * runtime shape check that closes that gap.
 */
describe('validateAnswer', () => {
  const MCQ_OPTIONS = [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }];

  describe('MCQ', () => {
    it('accepts a single valid option key', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, 'B', false)).toBeNull();
    });

    it('rejects an object payload (DEF-003 reproduction)', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, { x: 1 }, false)).toMatch(
        /must be a single-character option key/,
      );
    });

    it('rejects a boolean', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, true, false)).toMatch(
        /must be a single-character option key/,
      );
    });

    it('rejects a multi-character string', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, 'AB', false)).toMatch(
        /exactly one option key/,
      );
    });

    it('rejects a key that is not one of the question options', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, 'Z', false)).toMatch(
        /not one of the question options/,
      );
    });

    it('allows any single-character key when the question has no options recorded', () => {
      expect(validateAnswer('MCQ', [], 'A', false)).toBeNull();
    });
  });

  describe('MSQ', () => {
    it('accepts an array of valid option keys', () => {
      expect(validateAnswer('MSQ', MCQ_OPTIONS, ['A', 'C'], true)).toBeNull();
    });

    it('accepts an empty array (nothing selected)', () => {
      expect(validateAnswer('MSQ', MCQ_OPTIONS, [], true)).toBeNull();
    });

    it('rejects a bare string instead of an array', () => {
      expect(validateAnswer('MSQ', MCQ_OPTIONS, 'A', true)).toMatch(
        /must be an array of single-character option keys/,
      );
    });

    it('rejects an array containing a non-string element', () => {
      expect(validateAnswer('MSQ', MCQ_OPTIONS, ['A', 1], true)).toMatch(
        /must be an array of single-character option keys/,
      );
    });

    it('rejects a key that is not one of the question options', () => {
      expect(validateAnswer('MSQ', MCQ_OPTIONS, ['A', 'Z'], true)).toMatch(
        /not one of the question options/,
      );
    });
  });

  describe('INTEGER', () => {
    it('accepts a finite integer', () => {
      expect(validateAnswer('INTEGER', [], 42, false)).toBeNull();
    });

    it('accepts a negative integer', () => {
      expect(validateAnswer('INTEGER', [], -7, false)).toBeNull();
    });

    it('rejects a non-integer number', () => {
      expect(validateAnswer('INTEGER', [], 4.5, false)).toMatch(
        /must be a finite integer/,
      );
    });

    it('rejects a numeric string', () => {
      expect(validateAnswer('INTEGER', [], '42', false)).toMatch(
        /must be a finite integer/,
      );
    });

    it('rejects Infinity', () => {
      expect(validateAnswer('INTEGER', [], Infinity, false)).toMatch(
        /must be a finite integer/,
      );
    });
  });

  describe('clearing an answer', () => {
    it('null is always accepted regardless of type (clears the response)', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, null, false)).toBeNull();
      expect(validateAnswer('MSQ', MCQ_OPTIONS, null, true)).toBeNull();
      expect(validateAnswer('INTEGER', [], null, false)).toBeNull();
    });

    it('undefined is always accepted (field simply absent)', () => {
      expect(validateAnswer('MCQ', MCQ_OPTIONS, undefined, false)).toBeNull();
    });
  });
});
