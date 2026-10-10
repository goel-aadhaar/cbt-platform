/** One item of an uploaded file, as numbered by position and by its author. */
export interface NumberedItem {
  /** 1-based position of the block/row in the file. */
  seq: number;
  /** The number the author wrote for it ("10", "Q10"), if any. */
  label?: string | null;
}

/** Individual numbering warnings listed before the rest are summarised. */
const MAX_LISTED = 10;

/** The numeric part of a label: "Q10" and "10" are both 10. */
export function labelNumber(label: string | null | undefined): number | null {
  const m = /\d+/.exec(label ?? '');
  return m ? Number(m[0]) : null;
}

/** Does the author's number disagree with the question's place in the file? */
export function labelMismatch(item: NumberedItem): boolean {
  const n = labelNumber(item.label);
  return n !== null && n !== item.seq;
}

/**
 * Plain-language warnings about an upload's numbering, for the people who have
 * to check it against the source file.
 *
 * The import itself always preserves file order (`seq`); these exist because a
 * file whose own numbering jumps ("Q10" sitting third) is exactly the case that
 * looks like a bug in the platform when the question bank shows it, and a
 * skipped item is otherwise invisible.
 */
export function buildImportWarnings(items: NumberedItem[]): string[] {
  const warnings: string[] = [];
  if (items.length === 0) return warnings;
  const sorted = [...items].sort((a, b) => a.seq - b.seq);

  const present = new Set(sorted.map((i) => i.seq));
  const max = sorted[sorted.length - 1].seq;
  const skipped: number[] = [];
  for (let s = 1; s <= max; s++) if (!present.has(s)) skipped.push(s);
  if (skipped.length > 0) {
    const list = skipped.slice(0, MAX_LISTED).join(', ');
    const more =
      skipped.length > MAX_LISTED
        ? ` and ${skipped.length - MAX_LISTED} more`
        : '';
    warnings.push(
      `Item${skipped.length > 1 ? 's' : ''} ${list}${more} had no question text and ${
        skipped.length > 1 ? 'were' : 'was'
      } skipped.`,
    );
  }

  const mismatched = sorted.filter(labelMismatch);
  for (const item of mismatched.slice(0, MAX_LISTED)) {
    warnings.push(
      `File numbering jumps: ${item.label} is item ${item.seq} in the file.`,
    );
  }
  if (mismatched.length > MAX_LISTED) {
    warnings.push(
      `${mismatched.length - MAX_LISTED} more questions are numbered differently from their position in the file.`,
    );
  }

  const seenAt = new Map<number, number[]>();
  for (const item of sorted) {
    const n = labelNumber(item.label);
    if (n === null) continue;
    seenAt.set(n, [...(seenAt.get(n) ?? []), item.seq]);
  }
  for (const [n, seqs] of seenAt) {
    if (seqs.length > 1) {
      warnings.push(
        `Number ${n} is used more than once (items ${seqs.join(', ')}).`,
      );
    }
  }
  return warnings;
}
