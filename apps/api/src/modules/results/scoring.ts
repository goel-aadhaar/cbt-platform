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
