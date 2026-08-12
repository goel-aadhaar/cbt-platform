"use client";

import { useMemo } from "react";

import type {
  Difficulty,
  QuestionFilters,
  QuestionListItem,
  QuestionType,
} from "@/lib/questions";

import { FilterIcon, SearchIcon, XIcon } from "./icons";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const TYPES: QuestionType[] = ["MCQ", "MSQ", "INTEGER"];

/**
 * Shared question-bank filter bar (§2.4). Used by the Question Bank page and by
 * the exam builder's question picker so both filter the same way.
 *
 * Filters are applied SERVER-side (the bank is paginated), but the dropdown
 * options are derived from `facetSource` — a sample of the bank — so an admin
 * picks real subjects/chapters/tags instead of guessing at free text. Chapter
 * and topic options narrow to the selected subject/chapter.
 */
export function QuestionFilterBar({
  value,
  onChange,
  facetSource,
  resultCount,
}: {
  value: QuestionFilters;
  onChange: (next: QuestionFilters) => void;
  /** Questions used to build the option lists (typically an unfiltered page). */
  facetSource: QuestionListItem[];
  resultCount?: number;
}) {
  const facets = useMemo(() => {
    const subjects = new Set<string>();
    const chapters = new Set<string>();
    const topics = new Set<string>();
    const examTypes = new Set<string>();
    const tags = new Set<string>();
    for (const q of facetSource) {
      if (q.subject) subjects.add(q.subject);
      if (q.examType) examTypes.add(q.examType);
      // Narrow chapter/topic to the current subject/chapter selection so the
      // lists stay meaningful as the admin drills down.
      if (!value.subject || q.subject === value.subject) {
        if (q.chapter) chapters.add(q.chapter);
        if (!value.chapter || q.chapter === value.chapter) {
          if (q.topic) topics.add(q.topic);
        }
      }
      for (const t of q.tags ?? []) tags.add(t);
    }
    const sorted = (s: Set<string>) => [...s].sort();
    return {
      subjects: sorted(subjects),
      chapters: sorted(chapters),
      topics: sorted(topics),
      examTypes: sorted(examTypes),
      tags: sorted(tags),
    };
  }, [facetSource, value.subject, value.chapter]);

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
            className="h-10 w-full rounded-lg border border-admin-line bg-admin-bg pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
          />
        </div>

        <Select
          label="Subject"
          value={value.subject}
          options={facets.subjects}
          // Changing subject invalidates the narrower selections.
          onChange={(v) =>
            set({ subject: v, chapter: undefined, topic: undefined })
          }
        />
        <Select
          label="Chapter"
          value={value.chapter}
          options={facets.chapters}
          onChange={(v) => set({ chapter: v, topic: undefined })}
        />
        <Select
          label="Topic"
          value={value.topic}
          options={facets.topics}
          onChange={(v) => set({ topic: v })}
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
        <Select
          label="Exam"
          value={value.examType}
          options={facets.examTypes}
          onChange={(v) => set({ examType: v })}
        />
        <Select
          label="Tag"
          value={value.tag}
          options={facets.tags}
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
