"use client";

import { useEffect, useMemo, useState } from "react";

import {
  listChapters,
  listSubjects,
  listTopics,
  type ChapterRow,
  type Subject,
  type TopicRow,
} from "@/lib/admin";
import { listExamCategories, type ExamCategory } from "@/lib/exam-categories";
import type {
  Difficulty,
  QuestionFilters,
  QuestionListItem,
  QuestionType,
} from "@/lib/questions";

import { LoadingSpinner } from "@/components/loading-spinner";

import { FilterIcon, SearchIcon, XIcon } from "./icons";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const TYPES: QuestionType[] = ["MCQ", "MSQ", "INTEGER"];

/**
 * Shared question-bank filter bar (§2.4). Used by the Question Bank page and by
 * the exam builder's question picker so both filter the same way.
 *
 * Filters are applied SERVER-side (the bank is paginated). Subject/Chapter/
 * Topic/Exam options come from the real taxonomy catalogues (§2.4) rather than
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
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [examCategories, setExamCategories] = useState<ExamCategory[]>([]);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
    listExamCategories(true)
      .then((r) => setExamCategories(r.items))
      .catch(() => setExamCategories([]));
  }, []);

  useEffect(() => {
    if (!value.subjectId) return;
    listChapters(value.subjectId)
      .then(setChapters)
      .catch(() => setChapters([]));
  }, [value.subjectId]);

  useEffect(() => {
    if (!value.chapterId) return;
    listTopics(value.chapterId)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [value.chapterId]);

  // Stale chapter/topic rows from a previous selection are hidden (rather than
  // cleared via effect, which would call setState synchronously on every
  // render) whenever their parent filter is unset.
  const chapterOptions = value.subjectId ? chapters : [];
  const topicOptions = value.chapterId ? topics : [];

  const tagFacets = useMemo(() => {
    const tags = new Set<string>();
    for (const q of facetSource) for (const t of q.tags ?? []) tags.add(t);
    return [...tags].sort();
  }, [facetSource]);

  const set = (patch: Partial<QuestionFilters>) =>
    onChange({ ...value, ...patch });

  const activeCount = Object.values(value).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-admin-line/60 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
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

        <IdSelect
          label="Subject"
          value={value.subjectId}
          options={subjects}
          // Changing subject invalidates the narrower selections.
          onChange={(v) =>
            set({ subjectId: v, chapterId: undefined, topicId: undefined })
          }
        />
        <IdSelect
          label="Chapter"
          value={value.chapterId}
          options={chapterOptions}
          onChange={(v) => set({ chapterId: v, topicId: undefined })}
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

        <button
          type="button"
          onClick={() =>
            set({
              inPracticeLibrary: value.inPracticeLibrary ? undefined : true,
            })
          }
          className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
            value.inPracticeLibrary
              ? "border-admin bg-admin/10 text-admin"
              : "border-admin-line bg-white text-admin-muted hover:text-admin-ink"
          }`}
          title="Show only questions curated into the student practice library"
        >
          In practice library
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
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
