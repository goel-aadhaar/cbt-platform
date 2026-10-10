"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlusIcon } from "@/components/admin/icons";
import { Panel, StatusPill } from "@/components/staff/charts";
import {
  archiveChapter,
  archiveSubject,
  archiveTopic,
  archiveUnit,
  createChapter,
  createSubject,
  createTopic,
  createUnit,
  listChapters,
  listSubjects,
  listTopics,
  listUnits,
  moveChapter,
  refreshQuestionTaxonomyCatalogue,
  renameChapter,
  renameSubject,
  renameTopic,
  renameUnit,
  type ChapterRow,
  type Subject,
  type TopicRow,
  type UnitRow,
} from "@/lib/admin";

type Level = "subject" | "unit" | "chapter" | "topic";
type NamedItem = { id: string; name: string; isActive: boolean };

/** Unit-column selection meaning "chapters that have no unit". */
const UNASSIGNED = "__unassigned__";

/**
 * The question-bank taxonomy (§2.4): Subject → Unit → Chapter → Topic.
 *
 * Each subject owns units, each unit chapters, and each chapter topics. Units
 * are optional — a chapter without one sits in the "Unassigned" bucket, so
 * nothing has to be regrouped before units are adopted. Editors only ever need
 * to ADD, RENAME or MOVE a row (or archive one an old exam stopped
 * referencing); selecting a row scopes the next column to it.
 *
 * Mirrors `/admin/organization`: Miller columns, a single row-action
 * vocabulary (Rename / Archive) and `window.prompt` for names.
 */
export default function QuestionTaxonomyPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  // Each list remembers its parent so a previous selection's rows are never
  // shown under the new one while the fetch is in flight.
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
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  // "" = every chapter of the subject, UNASSIGNED, or a unit id.
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listSubjects()
      .then((rows) => !cancelled && setSubjects(rows))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Could not load subjects."),
      );
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    if (!selectedSubject) return;
    let cancelled = false;
    const subjectId = selectedSubject;
    const fail = (what: string) => (e: unknown) =>
      !cancelled &&
      setError(e instanceof Error ? e.message : `Could not load ${what}.`);
    listUnits(subjectId)
      .then((rows) => !cancelled && setUnits({ subjectId, rows }))
      .catch(fail("units"));
    listChapters(subjectId)
      .then((rows) => !cancelled && setChapters({ subjectId, rows }))
      .catch(fail("chapters"));
    return () => {
      cancelled = true;
    };
  }, [selectedSubject, refreshTick]);

  useEffect(() => {
    if (!selectedChapter) return;
    let cancelled = false;
    const chapterId = selectedChapter;
    listTopics(chapterId)
      .then((rows) => !cancelled && setTopics({ chapterId, rows }))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Could not load topics."),
      );
    return () => {
      cancelled = true;
    };
  }, [selectedChapter, refreshTick]);

  const unitRows =
    selectedSubject && units?.subjectId === selectedSubject ? units.rows : null;
  const allChapters =
    selectedSubject && chapters?.subjectId === selectedSubject
      ? chapters.rows
      : null;
  const topicRows =
    selectedChapter && topics?.chapterId === selectedChapter
      ? topics.rows
      : null;

  const unassignedCount = (allChapters ?? []).filter(
    (c) => !c.unitId && c.isActive,
  ).length;
  const visibleChapters =
    allChapters?.filter((c) =>
      !selectedUnit
        ? true
        : selectedUnit === UNASSIGNED
          ? !c.unitId
          : c.unitId === selectedUnit,
    ) ?? null;
  const selectedUnitRow = unitRows?.find((u) => u.id === selectedUnit);
  const activeUnits = (unitRows ?? []).filter((u) => u.isActive);

  function selectSubject(id: string) {
    setSelectedSubject(id);
    setSelectedUnit("");
    setSelectedChapter("");
  }
  function selectUnit(id: string) {
    setSelectedUnit(id);
    setSelectedChapter("");
  }

  /** Taxonomy edits change what the filter bars and drawers load. */
  function changed() {
    setRefreshTick((n) => n + 1);
    refreshQuestionTaxonomyCatalogue();
  }

  async function createLevel(level: Level) {
    setError(null);
    const prompts: Record<Level, string> = {
      subject: "Subject name (e.g. Physics)",
      unit: "Unit name (e.g. Mechanics)",
      chapter: "Chapter name",
      topic: "Topic name",
    };
    const name = window.prompt(prompts[level]);
    if (!name?.trim()) return;
    if (level === "unit" && !selectedSubject) return;
    if (level === "chapter" && !selectedSubject) return;
    if (level === "topic" && !selectedChapter) return;
    setBusyId("__new__");
    try {
      if (level === "subject") await createSubject(name.trim());
      if (level === "unit") await createUnit(selectedSubject, name.trim());
      if (level === "chapter") {
        // A chapter created while a unit is selected goes straight into it.
        await createChapter(
          selectedSubject,
          name.trim(),
          selectedUnitRow?.isActive ? selectedUnitRow.id : undefined,
        );
      }
      if (level === "topic") await createTopic(selectedChapter, name.trim());
      changed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Could not create ${level}.`);
    } finally {
      setBusyId(null);
    }
  }

  async function rename(level: Level, id: string, name: string) {
    const next = window.prompt(`Rename ${level}`, name);
    if (!next?.trim() || next.trim() === name) return;
    setBusyId(id);
    setError(null);
    try {
      if (level === "subject") await renameSubject(id, next.trim());
      if (level === "unit") await renameUnit(id, next.trim());
      if (level === "chapter") await renameChapter(id, next.trim());
      if (level === "topic") await renameTopic(id, next.trim());
      changed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not rename that row.");
    } finally {
      setBusyId(null);
    }
  }

  async function archive(level: Level, id: string, name: string) {
    if (!window.confirm(`Archive '${name}'?`)) return;
    setBusyId(id);
    setError(null);
    try {
      if (level === "subject") await archiveSubject(id);
      if (level === "unit") await archiveUnit(id);
      if (level === "chapter") await archiveChapter(id);
      if (level === "topic") await archiveTopic(id);
      changed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not archive that row.");
    } finally {
      setBusyId(null);
    }
  }

  async function move(chapter: ChapterRow, unitId: string | null) {
    if ((chapter.unitId ?? null) === unitId) return;
    setBusyId(chapter.id);
    setError(null);
    try {
      await moveChapter(chapter.id, unitId);
      // The chapter just left the column it was listed in; drop the selection
      // rather than leave topics showing for a row that vanished from view.
      if (selectedUnit && selectedChapter === chapter.id) {
        setSelectedChapter("");
      }
      changed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not move that chapter.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Question Taxonomy">
      <div className="flex flex-col gap-6">
        <p className="max-w-2xl text-sm text-admin-muted">
          The subject → unit → chapter → topic tree every question sits inside.
          Units are optional groupings of chapters; chapters without one are
          listed as Unassigned. New rows attach to the row selected on the left;
          archiving keeps existing references intact, so an old question keeps
          working after its subject has been retired.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Panel
            title={subjects ? `${subjects.length} Subjects` : "Subjects"}
            subtitle="The broadest classification, e.g. Physics"
            action={
              <NewButton
                disabled={busyId === "__new__"}
                onClick={() => void createLevel("subject")}
              />
            }
          >
            {subjects === null ? (
              <Skeleton />
            ) : subjects.length === 0 ? (
              <Empty text="No subjects yet. Click New to add the first one." />
            ) : (
              <ul className="flex flex-col gap-2">
                {subjects.map((s) => (
                  <Row
                    key={s.id}
                    item={s}
                    selectable
                    selected={s.id === selectedSubject}
                    busy={busyId === s.id}
                    onSelect={() => selectSubject(s.id)}
                    onRename={() => void rename("subject", s.id, s.name)}
                    onArchive={() => void archive("subject", s.id, s.name)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={unitRows ? `${unitRows.length} Units` : "Units"}
            subtitle={
              selectedSubject
                ? "Optional group of chapters, e.g. Mechanics"
                : "Select a subject first"
            }
            action={
              <NewButton
                disabled={!selectedSubject || busyId === "__new__"}
                onClick={() => void createLevel("unit")}
              />
            }
          >
            {!selectedSubject ? (
              <Empty text="Select a subject to see its units." />
            ) : unitRows === null || allChapters === null ? (
              <Skeleton />
            ) : (
              <ul className="flex flex-col gap-2">
                <BucketRow
                  label="All chapters"
                  count={allChapters.filter((c) => c.isActive).length}
                  selected={selectedUnit === ""}
                  onSelect={() => selectUnit("")}
                />
                {unitRows.map((u) => (
                  <Row
                    key={u.id}
                    item={u}
                    selectable
                    selected={u.id === selectedUnit}
                    busy={busyId === u.id}
                    meta={`${u.chapterCount} chapter${u.chapterCount === 1 ? "" : "s"}`}
                    onSelect={() => selectUnit(u.id)}
                    onRename={() => void rename("unit", u.id, u.name)}
                    onArchive={() => void archive("unit", u.id, u.name)}
                  />
                ))}
                <BucketRow
                  label="Unassigned"
                  count={unassignedCount}
                  selected={selectedUnit === UNASSIGNED}
                  onSelect={() => selectUnit(UNASSIGNED)}
                />
                {unitRows.length === 0 && (
                  <li>
                    <Empty text="No units yet. Chapters stay Unassigned until you add one." />
                  </li>
                )}
              </ul>
            )}
          </Panel>

          <Panel
            title={
              visibleChapters
                ? `${visibleChapters.length} Chapters`
                : "Chapters"
            }
            subtitle={
              !selectedSubject
                ? "Select a subject first"
                : selectedUnit === UNASSIGNED
                  ? "Chapters not in any unit"
                  : selectedUnitRow
                    ? `In ${selectedUnitRow.name}`
                    : "A study block inside the subject"
            }
            action={
              <NewButton
                disabled={!selectedSubject || busyId === "__new__"}
                onClick={() => void createLevel("chapter")}
              />
            }
          >
            {!selectedSubject ? (
              <Empty text="Select a subject to see its chapters." />
            ) : visibleChapters === null ? (
              <Skeleton />
            ) : visibleChapters.length === 0 ? (
              <Empty
                text={
                  selectedUnit
                    ? "No chapters in this selection."
                    : "No chapters yet in this subject."
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {visibleChapters.map((c) => (
                  <Row
                    key={c.id}
                    item={c}
                    selectable
                    selected={c.id === selectedChapter}
                    busy={busyId === c.id}
                    meta={
                      selectedUnit === ""
                        ? (c.unit?.name ?? "Unassigned")
                        : undefined
                    }
                    onSelect={() => setSelectedChapter(c.id)}
                    onRename={() => void rename("chapter", c.id, c.name)}
                    onArchive={() => void archive("chapter", c.id, c.name)}
                    extra={
                      c.isActive ? (
                        <select
                          aria-label={`Move ${c.name} to unit`}
                          value=""
                          disabled={busyId === c.id}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) void move(c, v === UNASSIGNED ? null : v);
                          }}
                          className="h-7 max-w-[8.5rem] rounded-md border border-admin-line bg-white px-1 text-xs font-bold text-admin-muted outline-none focus:border-admin disabled:opacity-50"
                        >
                          <option value="">Move to unit…</option>
                          {c.unitId && (
                            <option value={UNASSIGNED}>No unit</option>
                          )}
                          {activeUnits
                            .filter((u) => u.id !== c.unitId)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      ) : null
                    }
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={topicRows ? `${topicRows.length} Topics` : "Topics"}
            subtitle={
              selectedChapter
                ? "The most specific tag a question can carry"
                : "Select a chapter first"
            }
            action={
              <NewButton
                disabled={!selectedChapter || busyId === "__new__"}
                onClick={() => void createLevel("topic")}
              />
            }
          >
            {!selectedChapter ? (
              <Empty text="Select a chapter to see its topics." />
            ) : topicRows === null ? (
              <Skeleton />
            ) : topicRows.length === 0 ? (
              <Empty text="No topics yet in this chapter." />
            ) : (
              <ul className="flex flex-col gap-2">
                {topicRows.map((t) => (
                  <Row
                    key={t.id}
                    item={t}
                    busy={busyId === t.id}
                    onRename={() => void rename("topic", t.id, t.name)}
                    onArchive={() => void archive("topic", t.id, t.name)}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AdminShell>
  );
}

function NewButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1 rounded-md bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
    >
      <PlusIcon className="size-3" /> New
    </button>
  );
}

/** A non-editable "All" / "Unassigned" entry in the Units column. */
function BucketRow({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={
          "flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-admin-line/60 bg-admin-bg/40 px-3 py-2 text-left text-sm " +
          (selected ? "font-bold text-admin" : "text-admin-muted")
        }
      >
        <span>{label}</span>
        <span className="text-xs">{count}</span>
      </button>
    </li>
  );
}

function Row({
  item,
  selectable,
  selected,
  busy,
  meta,
  extra,
  onSelect,
  onRename,
  onArchive,
}: {
  item: NamedItem;
  selectable?: boolean;
  selected?: boolean;
  busy?: boolean;
  /** Small muted caption under the name (unit of a chapter, chapter count…). */
  meta?: string;
  /** Extra per-row control, rendered before Rename. */
  extra?: React.ReactNode;
  onSelect?: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-admin-line/60 bg-white px-3 py-2">
      <button
        type="button"
        disabled={!selectable || busy}
        onClick={onSelect}
        className={
          "flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-not-allowed " +
          (selected ? "font-bold text-admin" : "text-admin-ink")
        }
      >
        <span className="flex max-w-full items-center gap-2">
          <span className="truncate">{item.name}</span>
          <StatusPill tone={item.isActive ? "good" : "muted"}>
            {item.isActive ? "Active" : "Archived"}
          </StatusPill>
        </span>
        {meta && (
          <span className="max-w-full truncate text-xs font-normal text-admin-muted">
            {meta}
          </span>
        )}
      </button>
      <span className="flex shrink-0 items-center gap-1">
        {extra}
        <button
          type="button"
          disabled={busy}
          onClick={onRename}
          className="rounded-md px-2 py-1 text-xs font-bold text-admin-muted hover:bg-admin-bg hover:text-admin-ink disabled:opacity-50"
        >
          Rename
        </button>
        <button
          type="button"
          disabled={busy || !item.isActive}
          onClick={onArchive}
          title={
            item.isActive
              ? "Archive (keeps existing references)"
              : "Already archived"
          }
          className="rounded-md px-2 py-1 text-xs font-bold text-danger hover:bg-danger-5 disabled:opacity-30"
        >
          Archive
        </button>
      </span>
    </li>
  );
}

function Skeleton() {
  return <div className="h-32 animate-pulse rounded-lg bg-admin-surface" />;
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-admin-line/60 px-3 py-6 text-center text-sm text-admin-muted">
      {text}
    </p>
  );
}
