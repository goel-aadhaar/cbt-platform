import { BadRequestException } from '@nestjs/common';

import { labelMismatch } from '../imports/import-warnings';
import { hasFormulaPlaceholder } from './docx-equations';

export type ReviewFlag = 'formula' | 'answer' | 'label';

interface Flaggable {
  type: string;
  statement: string;
  options: unknown;
  answerKey: unknown;
  explanation: string | null;
  sourceSeq: number | null;
  sourceLabel: string | null;
}

function optionTexts(options: unknown): string[] {
  return Array.isArray(options)
    ? options.map((o) => (o as { text?: unknown })?.text as string)
    : [];
}

/** True when the statement, an option or the explanation still has `[[EQ…]]`. */
export function questionHasFormulaPlaceholder(q: {
  statement: string;
  options: unknown;
  explanation: string | null;
}): boolean {
  return hasFormulaPlaceholder(
    q.statement,
    q.explanation,
    ...optionTexts(q.options),
  );
}

/**
 * Refuse to move a question toward the bank while a Word equation placeholder
 * is still in it — publishing "Solve [[EQ: x2+3x=0]]" to students would be
 * worse than not importing it.
 */
export function assertNoFormulaPlaceholder(q: {
  statement: string;
  options: unknown;
  explanation: string | null;
}): void {
  if (questionHasFormulaPlaceholder(q)) {
    throw new BadRequestException(
      'Fix the formula marked [[EQ …]] first: retype it as LaTeX between ' +
        'dollar signs (e.g. $x^2 + 3x = 0$) in the question, then try again.',
    );
  }
}

/** Things a reviewer should look at again before approving, computed on read. */
export function reviewFlags(q: Flaggable): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (questionHasFormulaPlaceholder(q)) flags.push('formula');

  const keys = new Set(
    Array.isArray(q.options)
      ? q.options.map((o) => (o as { key?: unknown })?.key)
      : [],
  );
  const a = q.answerKey;
  const valid =
    q.type === 'INTEGER'
      ? typeof a === 'number'
      : q.type === 'MSQ'
        ? Array.isArray(a) && a.length > 0 && a.every((k) => keys.has(k))
        : typeof a === 'string' && keys.has(a);
  if (!valid) flags.push('answer');

  if (
    q.sourceSeq !== null &&
    labelMismatch({ seq: q.sourceSeq, label: q.sourceLabel })
  ) {
    flags.push('label');
  }
  return flags;
}
