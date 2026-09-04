"use client";

import { useMemo, useState } from "react";

/**
 * Choosing batches, when there are more than a handful.
 *
 * Every surface that assigns something to batches — inviting a teacher,
 * assigning one later, broadcasting a notice, scheduling an exam, sharing
 * study material — used to render one flat checkbox list. That is fine for
 * the four batches a new institute has and unusable for the sixty a real one
 * accumulates, where "JEE 2026 › Class 12 › Alpha" and "NEET 2026 › Class 12 ›
 * Alpha" sit twenty rows apart and read almost identically.
 *
 * So: filter by program, then by class, with the full path still on every row.
 *
 * Two rules that matter more than they look:
 *
 *  - Filtering NEVER changes the selection. Narrowing to one program and
 *    ticking a box must not quietly drop what was ticked under another —
 *    the count of hidden selections is shown instead, so nothing disappears
 *    silently.
 *  - The filters only appear when they would help. An institute with one
 *    program gets no program dropdown, because a control with a single option
 *    is furniture.
 */

export interface BatchOption {
  id: string;
  name: string;
  /** Null when the caller could not resolve the path (never fatal). */
  classId?: string | null;
  className?: string | null;
  programId?: string | null;
  programName?: string | null;
}

/** "Program › Class › Batch", degrading to whatever parts are known. */
export function batchLabel(b: BatchOption): string {
  return [b.programName, b.className, b.name].filter(Boolean).join(" › ");
}

const ALL = "";

export function BatchPicker({
  batches,
  selected,
  onChange,
  emptyMessage = "No batches available.",
  /** Rows before a search box appears; below this it is just clutter. */
  searchThreshold = 12,
}: {
  batches: BatchOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyMessage?: string;
  searchThreshold?: number;
}) {
  const [programId, setProgramId] = useState<string>(ALL);
  const [classId, setClassId] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const programs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of batches) {
      if (b.programId && b.programName) seen.set(b.programId, b.programName);
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [batches]);

  // Classes follow the chosen program: offering every class in the institute
  // under a program that has three of them invites an empty result.
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of batches) {
      if (programId !== ALL && b.programId !== programId) continue;
      if (b.classId && b.className) seen.set(b.classId, b.className);
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [batches, programId]);

  // A class chosen before the program was narrowed can fall outside it; treat
  // that as "no class filter" rather than showing an empty list, and derive it
  // so no effect has to reach in and correct the state afterwards.
  const activeClassId = classes.some((c) => c.id === classId) ? classId : ALL;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return batches.filter((b) => {
      if (programId !== ALL && b.programId !== programId) return false;
      if (activeClassId !== ALL && b.classId !== activeClassId) return false;
      if (q && !batchLabel(b).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [batches, programId, activeClassId, query]);

  const shownIds = shown.map((b) => b.id);
  const hiddenSelected = selected.filter((id) => !shownIds.includes(id)).length;
  const allShownChosen =
    shown.length > 0 && shown.every((b) => selected.includes(b.id));

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  const toggleAllShown = () =>
    onChange(
      allShownChosen
        ? selected.filter((id) => !shownIds.includes(id))
        : [...new Set([...selected, ...shownIds])],
    );

  if (batches.length === 0) {
    return <p className="text-xs text-admin-subtle">{emptyMessage}</p>;
  }

  const showFilters = programs.length > 1 || classes.length > 1;
  const showSearch = batches.length >= searchThreshold;

  return (
    <div className="flex flex-col gap-2">
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {programs.length > 1 && (
            <select
              value={programId}
              onChange={(e) => {
                setProgramId(e.target.value);
                setClassId(ALL);
              }}
              aria-label="Filter by program"
              className={filterCls}
            >
              <option value={ALL}>All programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {classes.length > 1 && (
            <select
              value={activeClassId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Filter by class"
              className={filterCls}
            >
              <option value={ALL}>All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {showSearch && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search batches…"
          aria-label="Search batches"
          className={filterCls}
        />
      )}

      {shown.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={toggleAllShown}
            className="font-semibold text-admin hover:underline"
          >
            {allShownChosen
              ? `Clear these ${shown.length}`
              : `Select these ${shown.length}`}
          </button>
          <span className="text-admin-muted">
            {selected.length} selected
            {/* Says so out loud, because the alternative is a filter that
                looks like it deselected something. */}
            {hiddenSelected > 0 && ` (${hiddenSelected} not shown)`}
          </span>
        </div>
      )}

      <div className="flex max-h-48 flex-col gap-1 overflow-auto rounded-lg border border-admin-line bg-white p-2">
        {shown.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-admin-muted">
            No batches match these filters.
          </p>
        ) : (
          shown.map((b) => (
            <label
              key={b.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-admin-ink hover:bg-admin-bg"
            >
              <input
                type="checkbox"
                checked={selected.includes(b.id)}
                onChange={() => toggle(b.id)}
                className="size-4 shrink-0 accent-admin"
              />
              <span className="truncate">{batchLabel(b)}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

const filterCls =
  "h-9 min-w-0 flex-1 rounded-lg border border-admin-line bg-white px-2.5 text-sm text-admin-ink outline-none focus:border-admin";
