/**
 * Pure helpers behind the Student List's checkbox selection.
 *
 * Kept free of runtime imports (types only) so they can be exercised directly
 * with Node's type stripping, without a test runner in apps/web.
 */
import type { StudentListItem } from "./students";

/** Selected students by id. Holds a copy of each row so selections made on
 * other pages still drive counts, bulk actions and export. */
export type Selection = ReadonlyMap<string, StudentListItem>;

export function emptySelection(): Selection {
  return new Map();
}

export function toggleRow(
  sel: Selection,
  row: StudentListItem,
  checked: boolean,
): Selection {
  const next = new Map(sel);
  if (checked) next.set(row.id, row);
  else next.delete(row.id);
  return next;
}

/** The header checkbox: adds or removes this page's rows only. */
export function togglePage(
  sel: Selection,
  page: readonly StudentListItem[],
  checked: boolean,
): Selection {
  const next = new Map(sel);
  for (const row of page) {
    if (checked) next.set(row.id, row);
    else next.delete(row.id);
  }
  return next;
}

export interface PageCheckState {
  checked: boolean;
  indeterminate: boolean;
  /** How many of this page's rows are selected. */
  onPage: number;
}

export function pageCheckState(
  sel: Selection,
  page: readonly StudentListItem[],
): PageCheckState {
  const onPage = page.reduce((n, r) => n + (sel.has(r.id) ? 1 : 0), 0);
  return {
    checked: page.length > 0 && onPage === page.length,
    indeterminate: onPage > 0 && onPage < page.length,
    onPage,
  };
}

/**
 * Replace the stored copy of any selected student that appears in `rows`
 * (a freshly loaded page, or a row a write just returned). Returns `sel`
 * itself when nothing is selected among them, so a state setter bails out.
 */
export function refreshSelected(
  sel: Selection,
  rows: readonly StudentListItem[],
): Selection {
  let next: Map<string, StudentListItem> | null = null;
  for (const row of rows) {
    if (sel.has(row.id) && sel.get(row.id) !== row) {
      next ??= new Map(sel);
      next.set(row.id, row);
    }
  }
  return next ?? sel;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}
