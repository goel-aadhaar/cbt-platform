"use client";

import { useEffect, useMemo, useState } from "react";

import { useQuestionTaxonomyCatalogue } from "@/hooks/use-question-taxonomy-catalogue";
import {
  listChaptersCached,
  listTopics,
  listUnitsCached,
  type ChapterRow,
  type TopicRow,
  type UnitRow,
} from "@/lib/admin";
import type {
  Difficulty,
  QuestionFilters,
  QuestionListItem,
  QuestionType,
} from "@/lib/questions";

import { LoadingSpinner } from "@/components/loading-spinner";

import { FilterIcon, SearchIcon, XIcon } from "./icons";
import { MultiSelect } from "./multi-select";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const TYPES: QuestionType[] = ["MCQ", "MSQ", "INTEGER"];

/** `unitId` value for "chapters that have no unit" (matches the API). */
export const UNASSIGNED_UNIT = "unassigned";

/**
 * The chapters a filter selects. A caller that still sets the single
 * `chapterId` (older code, a deep link) is read as a one-chapter selection;
 * the bar itself always writes `chapterIds`.
 */
export function selectedChapterIds(filters: QuestionFilters): string[] {
  if (filters.chapterIds?.length) return filters.chapterIds;
  return filters.chapterId ? [filters.chapterId] : [];
}

/**
 * Shared question-bank filter bar (§2.4). Used by the Question Bank page and by
 * the exam builder's question picker so both filter the same way.
 *
 * Filters are applied SERVER-side (the bank is paginated). Subject, Unit,
 * Chapter and Topic cascade: each level narrows the next, and changing one
 * clears everything below it. Chapter is a multi-select (`chapterIds`); Topic
 * needs exactly one chapter. Subject/Unit/Chapter/Topic/Exam options come from the real taxonomy catalogues (§2.4) rather than
 * being sampled off `facetSource`, so the dropdowns always match what admins
 * actually manage; only Tag still derives from `facetSource` since tags have
 * no catalogue of their own.
 */
export function QuestionFilterBar({
  value,
  onChange,
  facetSource,
  resultCount,
  searching = false,
  subjectLocked = false,
  showSearch = true,
}: {
  value: QuestionFilters;
  onChange: (next: QuestionFilters) => void;
  /** Questions used to build the tag option list (typically an unfiltered page). */
  facetSource: QuestionListItem[];
  resultCount?: number;
  /**
   * A query for the current search term is still on its way. Shown in the box
   * itself rather than over the results: the list below stays readable while
   * the new one is fetched, and a full-panel loader for a keystroke would be
   * more disruptive than the wait it describes.
   */
  searching?: boolean;
  /**
   * The caller already knows the only subject that makes sense here (the
   * exam builder's question picker, scoped to the active section's subject)
   * and is driving `value.subjectId` itself — so the Subject control would
   * just be a second, redundant way to pick something already decided.
   * Hidden rather than merely pre-filled, and "Clear" leaves it alone.
   */
  subjectLocked?: boolean;
  /**
   * Set false when the page already has its own search box (the teacher
   * console) so the bar only contributes the taxonomy/attribute filters.
   */
  showSearch?: boolean;
}) {
  const taxonomy = useQuestionTaxonomyCatalogue();
  const subjects = taxonomy?.subjects ?? [];
  const examCategories = taxonomy?.examCategories ?? [];
  // Each list remembers which parent it was loaded for, so rows from a
  // previous selection are ignored instead of cleared via an effect (which
  // would call setState synchronously on every render).
  const [units, setUnits] = useState<{
    subjectId: string;
    rows: UnitRow[];
  } | null>(null);
  const [chapters, setChapters] = useState<{
    subjectId: string;
    rows: ChapterRow[];
  } | null>(null);
  const [topics, setTopics] = useState<{
    chapterId: string;
    rows: TopicRow[];
  } | null>(null);

  const chapterIds = selectedChapterIds(value);
  // Topics belong to one chapter, so the Topic control needs exactly one.
  const singleChapterId = chapterIds.length === 1 ? chapterIds[0] : undefined;

  useEffect(() => {
    const subjectId = value.subjectId;
    if (!subjectId) return;
    let cancelled = false;
    listUnitsCached(subjectId)
      .then((rows) => !cancelled && setUnits({ subjectId, rows }))
      .catch(() => !cancelled && setUnits({ subjectId, rows: [] }));
    listChaptersCached(subjectId)
      .then((rows) => !cancelled && setChapters({ subjectId, rows }))
      .catch(() => !cancelled && setChapters({ subjectId, rows: [] }));
    return () => {
      cancelled = true;
    };
  }, [value.subjectId]);

  useEffect(() => {
    if (!singleChapterId) return;
    let cancelled = false;
    listTopics(singleChapterId)
      .then(
        (rows) => !cancelled && setTopics({ chapterId: singleChapterId, rows }),
      )
      .catch(
        () => !cancelled && setTopics({ chapterId: singleChapterId, rows: [] }),
      );
    return () => {
      cancelled = true;
    };
  }, [singleChapterId]);

  const subjectChapters =
    value.subjectId && chapters?.subjectId === value.subjectId
      ? chapters.rows
      : [];
  const unitRows =
    value.subjectId && units?.subjectId === value.subjectId ? units.rows : [];
  const hasUnassigned = subjectChapters.some((c) => !c.unitId);
  const unitOptions = [
    ...unitRows.map((u) => ({
      id: u.id,
      name: u.isActive ? u.name : `${u.name} (archived)`,
    })),
    ...(hasUnassigned && unitRows.length > 0
      ? [{ id: UNASSIGNED_UNIT, name: "Unassigned chapters" }]
      : []),
  ];
  const chapterOptions = subjectChapters
    .filter((c) =>
      !value.unitId
        ? true
        : value.unitId === UNASSIGNED_UNIT
          ? !c.unitId
          : c.unitId === value.unitId,
    )
    .map((c) => ({
      id: c.id,
      name: c.isActive ? c.name : `${c.name} (archived)`,
    }));
  const topicOptions =
    singleChapterId && topics?.chapterId === singleChapterId ? topics.rows : [];

  const tagFacets = useMemo(() => {
    const tags = new Set<string>();
    for (const q of facetSource) for (const t of q.tags ?? []) tags.add(t);
    return [...tags].sort();
  }, [facetSource]);

  const set = (patch: Partial<QuestionFilters>) =>
    onChange({ ...value, ...patch });

  // The locked subjectId isn't a filter the user picked from this bar, so it
  // doesn't count toward "N filters active" and survives "Clear".
  const activeCount = Object.entries(value).filter(
    ([key, v]) =>
      (Array.isArray(v) ? v.length > 0 : Boolean(v)) &&
      !(subjectLocked && key === "subjectId"),
  ).length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-admin-line/60 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative flex min-w-[200px] flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
            <input
              value={value.search ?? ""}
              onChange={(e) => set({ search: e.target.value || undefined })}
              placeholder="Search question text…"
              aria-busy={searching || undefined}
              className="h-10 w-full rounded-lg border border-admin-line bg-admin-bg pl-9 pr-9 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
            />
            {searching && (
              <span className="pointer-events-none absolute right-3 flex items-center">
                <LoadingSpinner size={14} label="Searching" />
              </span>
            )}
          </div>
        )}

        {!subjectLocked && (
          <IdSelect
            label="Subject"
            value={value.subjectId}
            options={subjects}
            // Changing subject invalidates the narrower selections.
            onChange={(v) =>
              set({
                subjectId: v,
                unitId: undefined,
                chapterId: undefined,
                chapterIds: undefined,
                topicId: undefined,
              })
            }
          />
        )}
        <IdSelect
          label="Unit"
          value={value.unitId}
          options={unitOptions}
          // A unit narrows the chapter list, so earlier chapter picks go.
          onChange={(v) =>
            set({
              unitId: v,
              chapterId: undefined,
              chapterIds: undefined,
              topicId: undefined,
            })
          }
        />
        <MultiSelect
          label="Chapter"
          value={chapterIds}
          options={chapterOptions}
          onChange={(ids) =>
            set({
              chapterId: undefined,
              chapterIds: ids.length ? ids : undefined,
              topicId:
                ids.length === 1 && ids[0] === singleChapterId
                  ? value.topicId
                  : undefined,
            })
          }
        />
        <IdSelect
          label="Topic"
          value={value.topicId}
          options={topicOptions}
          onChange={(v) => set({ topicId: v })}
        />
        <Select
          label="Difficulty"
          value={value.difficulty}
          options={DIFFICULTIES}
          onChange={(v) => set({ difficulty: v as Difficulty | undefined })}
        />
        <Select
          label="Type"
          value={value.type}
          options={TYPES}
          onChange={(v) => set({ type: v as QuestionType | undefined })}
        />
        <IdSelect
          label="Exam"
          value={value.examCategoryId}
          options={examCategories}
          onChange={(v) => set({ examCategoryId: v })}
        />
        <Select
          label="Tag"
          value={value.tag}
          options={tagFacets}
          onChange={(v) => set({ tag: v })}
        />

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange(subjectLocked ? { subjectId: value.subjectId } : {})
            }
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-admin-2 hover:underline"
          >
            <XIcon className="size-3.5" /> Clear
          </button>
        )}
      </div>

      {(activeCount > 0 || resultCount !== undefined) && (
        <p className="flex items-center gap-2 text-xs text-admin-muted">
          <FilterIcon className="size-3.5" />
          {activeCount > 0
            ? `${activeCount} filter${activeCount > 1 ? "s" : ""} active`
            : "No filters"}
          {resultCount !== undefined && ` · ${resultCount} question(s) match`}
        </p>
      )}
    </div>
  );
}

/** Small "Unit: Mechanics" pill for question rows; nothing when the chapter has no unit. */
export function UnitChip({ question }: { question: QuestionListItem }) {
  const name = question.chapterRef?.unit?.name;
  if (!name) return null;
  return (
    <span
      title={`Unit: ${name}`}
      className="inline-flex max-w-full items-center truncate rounded-full bg-admin/10 px-2 py-0.5 text-[11px] font-semibold text-admin"
    >
      {name}
    </span>
  );
}

function IdSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { id: string; name: string }[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      disabled={options.length === 0}
      className={`h-10 rounded-lg border px-2.5 text-sm outline-none focus:border-admin disabled:opacity-40 ${
        value
          ? "border-admin bg-admin/5 font-semibold text-admin"
          : "border-admin-line bg-white text-admin-ink"
      }`}
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      disabled={options.length === 0}
      className={`h-10 rounded-lg border px-2.5 text-sm outline-none focus:border-admin disabled:opacity-40 ${
        value
          ? "border-admin bg-admin/5 font-semibold text-admin"
          : "border-admin-line bg-white text-admin-ink"
      }`}
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
