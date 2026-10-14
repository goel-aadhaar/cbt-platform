"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  BookOpenIcon,
  GraduationCapIcon,
  LayersIcon,
} from "@/components/admin/icons";
import type { RowAction } from "@/components/admin/row-actions-menu";
import {
  AddButton,
  CardShell,
  CardSkeleton,
  EmptyState,
  ItemCard,
  LEVELS,
  LEVEL_LABEL,
  LevelIcon,
  MoveModal,
  NameModal,
  SearchBox,
  StepHint,
  Stepper,
  StructureCard,
  SubjectIcon,
  type Level,
} from "@/components/admin/taxonomy/taxonomy-parts";
import { useOrgCatalogue } from "@/hooks/use-org-catalogue";
import {
  archiveChapter,
  archiveSubject,
  archiveTopic,
  archiveUnit,
  classLabel,
  classesOfSubjects,
  createChapter,
  createSubject,
  createTopic,
  createUnit,
  listChapters,
  listSubjectsWithCounts,
  listTopics,
  listUnits,
  moveChapter,
  moveSubjectToClass,
  NO_CLASS,
  refreshQuestionTaxonomyCatalogue,
  renameChapter,
  renameSubject,
  renameTopic,
  renameUnit,
  type ChapterRow,
  type SubjectClass,
  type SubjectCounts,
  type SubjectWithCounts,
  type TopicRow,
  type UnitRow,
} from "@/lib/admin";

/** Unit selection meaning "chapters that have no unit". */
const UNASSIGNED = "__unassigned__";

type Dialog =
  | { kind: "add"; level: Level }
  | { kind: "rename"; level: Level; id: string; name: string }
  | { kind: "move"; chapter: ChapterRow }
  | { kind: "moveSubject"; subject: SubjectWithCounts }
  | null;

type NamedRow = { id: string; name: string; isActive: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const subjectMeta = (c: SubjectCounts) =>
  `${plural(c.units, "unit")} • ${plural(c.chapters, "chapter")} • ${plural(c.topics, "topic")}`;

const matches = (name: string, q: string) =>
  !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());

const EMPTY_SEARCH: Record<Level, string> = {
  class: "",
  subject: "",
  unit: "",
  chapter: "",
  topic: "",
};

/**
 * The question-bank taxonomy (§2.4): Class → Subject → Unit → Chapter → Topic,
 * as a drill-down wizard. The left card lists classes, then the chosen class's
 * subjects; the right card shows the next level for whatever is selected
 * (units of the subject, chapters of the unit, topics of the chapter). Units are optional — chapters without one
 * sit in an "Unassigned chapters" card. Archiving keeps existing references
 * intact, so an old question keeps working after its subject was retired.
 */
export default function QuestionTaxonomyPage() {
  const [subjects, setSubjects] = useState<SubjectWithCounts[] | null>(null);
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
  const catalogue = useOrgCatalogue();
  // "" = none, NO_CLASS, or a class id.
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  // "" = none, UNASSIGNED, or a unit id.
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listSubjectsWithCounts()
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

  const programNames = new Map(
    (catalogue?.programs ?? []).map((p) => [p.id, p.name]),
  );
  const catalogueClasses: SubjectClass[] = (catalogue?.classes ?? [])
    .filter((c) => c.isActive)
    .map((c) => ({
      id: c.id,
      name: c.name,
      isActive: true,
      programId: c.programId,
      programName: programNames.get(c.programId) ?? "",
    }))
    .sort(
      (a, b) =>
        a.programName.localeCompare(b.programName) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  // A subject can sit under a class that is no longer in the active catalogue;
  // keep that class reachable so its subjects are not orphaned.
  const knownClassIds = new Set(catalogueClasses.map((c) => c.id));
  const classChoices: SubjectClass[] = [
    ...catalogueClasses,
    ...classesOfSubjects(subjects ?? []).filter(
      (c) => !knownClassIds.has(c.id),
    ),
  ];
  const labelOfClass = (c: SubjectClass) => classLabel(c, classChoices);

  const subjectsOf = (classId: string) =>
    (subjects ?? []).filter((s) =>
      classId === NO_CLASS ? !s.classId : s.classId === classId,
    );
  const noClassSubjects = subjectsOf(NO_CLASS);
  const classRow = classChoices.find((c) => c.id === selectedClass);
  const className =
    selectedClass === NO_CLASS
      ? "No class"
      : classRow
        ? labelOfClass(classRow)
        : "";
  const classSubjects = selectedClass ? subjectsOf(selectedClass) : [];

  const subjectRow = classSubjects.find((s) => s.id === selectedSubject);
  const unitRow = unitRows?.find((u) => u.id === selectedUnit);
  const chapterRow = allChapters?.find((c) => c.id === selectedChapter);
  const unassignedCount = (allChapters ?? []).filter(
    (c) => !c.unitId && c.isActive,
  ).length;
  const visibleChapters =
    allChapters?.filter((c) =>
      selectedUnit === UNASSIGNED ? !c.unitId : c.unitId === selectedUnit,
    ) ?? null;
  const activeUnits = (unitRows ?? []).filter((u) => u.isActive);

  const unitName =
    selectedUnit === UNASSIGNED ? "Unassigned" : (unitRow?.name ?? "");
  const names: Record<Level, string> = {
    class: className,
    subject: subjectRow?.name ?? "",
    unit: selectedUnit ? unitName : "",
    chapter: selectedChapter ? (chapterRow?.name ?? "") : "",
    topic: "",
  };
  // The level whose rows the right-hand card is listing.
  const rightLevel: Exclude<Level, "class" | "subject"> | null =
    !selectedClass || !selectedSubject
      ? null
      : !selectedUnit
        ? "unit"
        : !selectedChapter
          ? "chapter"
          : "topic";
  const current = rightLevel
    ? LEVELS.indexOf(rightLevel) + 1
    : selectedClass
      ? 2
      : 1;

  function selectClass(id: string) {
    setError(null);
    setNotice(null);
    setSelectedClass(id);
    setSelectedSubject("");
    setSelectedUnit("");
    setSelectedChapter("");
    setSearch(EMPTY_SEARCH);
  }
  function selectSubject(id: string) {
    setError(null);
    setNotice(null);
    setSelectedSubject(id);
    setSelectedUnit("");
    setSelectedChapter("");
    setSearch((s) => ({ ...s, unit: "", chapter: "", topic: "" }));
  }
  function selectUnit(id: string) {
    setError(null);
    setNotice(null);
    setSelectedUnit(id);
    setSelectedChapter("");
    setSearch((s) => ({ ...s, chapter: "", topic: "" }));
  }
  function selectChapter(id: string) {
    setError(null);
    setNotice(null);
    setSelectedChapter(id);
    setSearch((s) => ({ ...s, topic: "" }));
  }
  /** Back to the state in which `level` is the one being chosen. */
  function goTo(level: Level) {
    if (level === "class") selectClass("");
    else if (level === "subject") selectSubject("");
    else if (level === "unit") selectUnit("");
    else if (level === "chapter") selectChapter("");
  }

  /** Taxonomy edits change what the filter bars and drawers load. */
  function changed() {
    setRefreshTick((n) => n + 1);
    refreshQuestionTaxonomyCatalogue();
  }

  async function add(level: Level, name: string) {
    if (level === "subject") {
      if (!selectedClass || selectedClass === NO_CLASS) {
        throw new Error("Pick a class to add a subject.");
      }
      const created = await createSubject(name, selectedClass);
      selectSubject(created.id);
    }
    if (level === "unit") await createUnit(selectedSubject, name);
    if (level === "chapter") {
      // A chapter created while a unit is selected goes straight into it.
      await createChapter(
        selectedSubject,
        name,
        unitRow?.isActive ? unitRow.id : undefined,
      );
    }
    if (level === "topic") await createTopic(selectedChapter, name);
    changed();
    setDialog(null);
  }

  async function rename(level: Level, id: string, name: string) {
    if (level === "subject") await renameSubject(id, name);
    if (level === "unit") await renameUnit(id, name);
    if (level === "chapter") await renameChapter(id, name);
    if (level === "topic") await renameTopic(id, name);
    changed();
    setDialog(null);
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
    await moveChapter(chapter.id, unitId);
    changed();
    setDialog(null);
  }

  async function moveSubject(
    subject: SubjectWithCounts,
    classId: string | null,
  ) {
    await moveSubjectToClass(subject.id, classId);
    changed();
    setDialog(null);
    const target = classChoices.find((c) => c.id === classId);
    // The subject leaves the class list being shown, so a selected one can no
    // longer be the working selection.
    if (subject.id === selectedSubject) selectClass("");
    setNotice(
      `Moved '${subject.name}' to ${target ? labelOfClass(target) : "No class"}.`,
    );
  }

  function actionsFor(
    level: Level,
    item: NamedRow,
    chapter?: ChapterRow,
    subject?: SubjectWithCounts,
  ): RowAction[] {
    const busy = busyId === item.id;
    const list: RowAction[] = [
      {
        label: "Rename",
        disabled: busy,
        onClick: () =>
          setDialog({ kind: "rename", level, id: item.id, name: item.name }),
      },
    ];
    if (chapter && chapter.isActive) {
      list.push({
        label: "Move to unit…",
        disabled: busy,
        onClick: () => setDialog({ kind: "move", chapter }),
      });
    }
    if (subject && subject.isActive) {
      list.push({
        label: "Move to class…",
        disabled: busy,
        onClick: () => setDialog({ kind: "moveSubject", subject }),
      });
    }
    list.push({
      label: item.isActive ? "Archive" : "Archive (already archived)",
      danger: true,
      disabled: busy || !item.isActive,
      onClick: () => void archive(level, item.id, item.name),
    });
    return list;
  }

  const hint =
    current === 1
      ? "Start by choosing a class. Each step unlocks the next level."
      : current === 2
        ? selectedClass === NO_CLASS
          ? "These subjects have no class yet. Open one to manage it, or move it into a class."
          : `Now add subjects for ${names.class}, then open one to manage its units.`
        : current === 3
          ? `Now add units for ${names.subject}, or open a unit's chapters once it exists.`
          : current === 4
            ? `Now add chapters under ${unitName}.`
            : `Finally add topics under ${names.chapter}.`;

  /* ---------------------------- right card ---------------------------- */

  function renderRight() {
    if (!rightLevel) {
      return (
        <EmptyState
          title={selectedClass ? "No subject selected" : "No class selected"}
          caption={
            selectedClass
              ? "Pick a subject on the left to manage its units, chapters and topics."
              : "Pick a class on the left to see its subjects."
          }
        />
      );
    }

    const meta = {
      unit: {
        heading: `Units in ${names.subject}`,
        caption:
          "Units are larger sections under a subject. Create units to organize your chapters.",
        emptyTitle: "No units added yet",
        emptyCaption: "Create a unit to group related chapters.",
        firstCta: "Create first unit",
        addCta: "Add unit",
        searchLabel: "Search units...",
      },
      chapter: {
        heading:
          selectedUnit === UNASSIGNED
            ? "Unassigned chapters"
            : `Chapters in ${unitName}`,
        caption:
          selectedUnit === UNASSIGNED
            ? "Chapters that are not in any unit yet. Move them into a unit whenever you are ready."
            : "Chapters are the study blocks inside a unit. Create chapters to organize your topics.",
        emptyTitle: "No chapters added yet",
        emptyCaption: "Create a chapter to group related topics.",
        firstCta: "Create first chapter",
        addCta: "Add chapter",
        searchLabel: "Search chapters...",
      },
      topic: {
        heading: `Topics in ${names.chapter}`,
        caption:
          "Topics are the most specific tag a question can carry. Create topics to tag questions precisely.",
        emptyTitle: "No topics added yet",
        emptyCaption: "Create a topic to tag questions inside this chapter.",
        firstCta: "Create first topic",
        addCta: "Add topic",
        searchLabel: "Search topics...",
      },
    }[rightLevel];

    const crumbs: { label: string; onClick?: () => void }[] = [
      { label: names.class, onClick: () => goTo("subject") },
      { label: names.subject, onClick: () => goTo("unit") },
    ];
    if (rightLevel !== "unit") {
      crumbs.push({ label: unitName, onClick: () => goTo("chapter") });
    }
    if (rightLevel === "topic") {
      crumbs.push({ label: names.chapter });
    }
    crumbs.push({ label: `${LEVEL_LABEL[rightLevel]}s` });
    // The last crumb names the level and the one before may be the current
    // parent; only ancestors above the listed level are links.
    const linkable = crumbs.length - 1;

    const q = search[rightLevel];
    let rows: React.ReactNode = null;
    let total = 0;
    let shown = 0;
    let loading = false;

    if (rightLevel === "unit") {
      if (unitRows === null || allChapters === null) loading = true;
      else {
        total = unitRows.length + (unassignedCount > 0 ? 1 : 0);
        const showUnassigned =
          unassignedCount > 0 && matches("Unassigned chapters", q);
        const shownUnits = unitRows.filter((u) => matches(u.name, q));
        shown = shownUnits.length + (showUnassigned ? 1 : 0);
        rows = (
          <>
            {showUnassigned && (
              <ItemCard
                icon={<LevelIcon level="chapter" className="size-5" />}
                name="Unassigned chapters"
                meta={plural(unassignedCount, "chapter")}
                onSelect={() => selectUnit(UNASSIGNED)}
              />
            )}
            {shownUnits.map((u) => (
              <ItemCard
                key={u.id}
                icon={<LevelIcon level="unit" className="size-5" />}
                name={u.name}
                meta={plural(u.chapterCount, "chapter")}
                archived={!u.isActive}
                busy={busyId === u.id}
                onSelect={() => selectUnit(u.id)}
                actions={actionsFor("unit", u)}
              />
            ))}
          </>
        );
      }
    } else if (rightLevel === "chapter") {
      if (visibleChapters === null) loading = true;
      else {
        total = visibleChapters.length;
        const shownChapters = visibleChapters.filter((c) => matches(c.name, q));
        shown = shownChapters.length;
        rows = shownChapters.map((c) => (
          <ItemCard
            key={c.id}
            icon={<LevelIcon level="chapter" className="size-5" />}
            name={c.name}
            archived={!c.isActive}
            busy={busyId === c.id}
            onSelect={() => selectChapter(c.id)}
            actions={actionsFor("chapter", c, c)}
          />
        ));
      }
    } else {
      if (topicRows === null) loading = true;
      else {
        total = topicRows.length;
        const shownTopics = topicRows.filter((t) => matches(t.name, q));
        shown = shownTopics.length;
        rows = shownTopics.map((t) => (
          <ItemCard
            key={t.id}
            selectable={false}
            icon={<LevelIcon level="topic" className="size-5" />}
            name={t.name}
            archived={!t.isActive}
            busy={busyId === t.id}
            actions={actionsFor("topic", t)}
          />
        ));
      }
    }

    const addDisabled = busyId !== null;
    const noMatch = total > 0 && shown === 0;

    return (
      <>
        <nav aria-label="Breadcrumb" className="text-sm text-admin-muted">
          <ol className="flex flex-wrap items-center gap-x-2">
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden>/</span>}
                {c.onClick && i < linkable ? (
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="font-medium text-admin hover:underline"
                  >
                    {c.label}
                  </button>
                ) : (
                  <span aria-current={i === linkable ? "page" : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <LevelIcon
              level={rightLevel}
              className="mt-0.5 size-6 shrink-0 text-admin"
            />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-admin-ink">
                {meta.heading}
              </h2>
              <p className="mt-0.5 text-sm text-admin-muted">{meta.caption}</p>
            </div>
          </div>
          {total > 0 && (
            <AddButton
              label={meta.addCta}
              disabled={addDisabled}
              onClick={() => setDialog({ kind: "add", level: rightLevel })}
            />
          )}
        </div>

        {loading ? (
          <div className="mt-5">
            <CardSkeleton />
          </div>
        ) : total === 0 ? (
          <EmptyState
            title={meta.emptyTitle}
            caption={meta.emptyCaption}
            cta={meta.firstCta}
            disabled={addDisabled}
            onCta={() => setDialog({ kind: "add", level: rightLevel })}
          >
            {rightLevel === "unit" && (
              <button
                type="button"
                onClick={() => selectUnit(UNASSIGNED)}
                className="mt-4 text-sm font-medium text-admin hover:underline"
              >
                Or add chapters without a unit
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            <SearchBox
              value={q}
              placeholder={meta.searchLabel}
              onChange={(v) => setSearch((s) => ({ ...s, [rightLevel]: v }))}
            />
            <ul className="flex flex-col gap-3">{rows}</ul>
            {noMatch && (
              <p className="rounded-lg border border-dashed border-admin-line/60 px-3 py-6 text-center text-sm text-admin-muted">
                Nothing matches &quot;{q.trim()}&quot;.
              </p>
            )}
            {rightLevel === "unit" && unassignedCount === 0 && (
              <button
                type="button"
                onClick={() => selectUnit(UNASSIGNED)}
                className="self-start text-sm font-medium text-admin hover:underline"
              >
                Add chapters without a unit
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  const subjectList = classSubjects.filter((s) =>
    matches(s.name, search.subject),
  );

  const classSubjectsMeta = (list: SubjectWithCounts[]) => {
    const active = list.filter((s) => s.isActive).length;
    const archived = list.length - active;
    return (
      plural(active, "subject") +
      (archived > 0 ? ` • ${archived} archived` : "")
    );
  };
  const classList = classChoices.filter((c) =>
    matches(labelOfClass(c), search.class),
  );
  const showNoClass =
    noClassSubjects.length > 0 && matches("No class", search.class);
  const addBlocked =
    selectedClass === NO_CLASS || (classRow ? !classRow.isActive : false);

  function renderClassCard() {
    const loading = subjects === null || catalogue === null;
    return (
      <>
        <div className="flex min-w-0 items-start gap-3">
          <GraduationCapIcon className="mt-0.5 size-6 shrink-0 text-admin" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-admin-ink">Classes</h2>
            <p className="mt-0.5 text-sm text-admin-muted">
              Select a class to manage its subjects, units, chapters and topics.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {loading ? (
            <CardSkeleton />
          ) : classChoices.length === 0 && noClassSubjects.length === 0 ? (
            <EmptyState
              title="No classes yet"
              caption="Create classes under Organization first, then come back to build their subjects."
            >
              <Link
                href="/admin/organization"
                className="mt-4 inline-flex items-center rounded-lg bg-admin px-4 py-2.5 text-sm font-bold text-white hover:opacity-95"
              >
                Go to Organization
              </Link>
            </EmptyState>
          ) : (
            <>
              <SearchBox
                value={search.class}
                placeholder="Search classes..."
                onChange={(v) => setSearch((s) => ({ ...s, class: v }))}
              />
              {classChoices.length === 0 && (
                <p className="rounded-lg border border-dashed border-admin-line/60 px-3 py-4 text-center text-sm text-admin-muted">
                  No classes yet.{" "}
                  <Link
                    href="/admin/organization"
                    className="font-medium text-admin hover:underline"
                  >
                    Create classes under Organization first.
                  </Link>
                </p>
              )}
              {classList.length === 0 && !showNoClass ? (
                classChoices.length > 0 && (
                  <p className="rounded-lg border border-dashed border-admin-line/60 px-3 py-6 text-center text-sm text-admin-muted">
                    Nothing matches &quot;{search.class.trim()}&quot;.
                  </p>
                )
              ) : (
                <ul className="flex flex-col gap-3">
                  {classList.map((c) => (
                    <ItemCard
                      key={c.id}
                      icon={<LevelIcon level="class" className="size-5" />}
                      name={labelOfClass(c)}
                      meta={classSubjectsMeta(subjectsOf(c.id))}
                      archived={!c.isActive}
                      onSelect={() => selectClass(c.id)}
                    />
                  ))}
                  {showNoClass && (
                    <ItemCard
                      icon={<LayersIcon className="size-5" />}
                      name="No class"
                      meta={`${classSubjectsMeta(noClassSubjects)} • not assigned to a class yet`}
                      onSelect={() => selectClass(NO_CLASS)}
                    />
                  )}
                </ul>
              )}
              {classChoices.length > 0 && (
                <p className="text-xs text-admin-muted">
                  Missing a class?{" "}
                  <Link
                    href="/admin/organization"
                    className="font-medium text-admin hover:underline"
                  >
                    Manage classes under Organization.
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  function renderSubjectCard() {
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <BookOpenIcon className="mt-0.5 size-6 shrink-0 text-admin" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-admin-ink">Subjects</h2>
              <p className="mt-0.5 text-sm text-admin-muted">
                Select a subject to manage its units, chapters and topics.
              </p>
            </div>
          </div>
          <AddButton
            label="Add subject"
            disabled={busyId !== null || addBlocked}
            onClick={() => setDialog({ kind: "add", level: "subject" })}
          />
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-admin-surface px-3 py-2.5 text-sm">
          <GraduationCapIcon className="size-4 shrink-0 text-admin" />
          <span className="text-xs font-bold text-admin-muted">Class</span>
          <span className="min-w-0 truncate font-semibold text-admin-ink">
            {names.class || "Unknown class"}
          </span>
          <button
            type="button"
            onClick={() => goTo("class")}
            className="ml-auto text-xs font-medium text-admin hover:underline"
          >
            Change class
          </button>
        </p>
        {addBlocked && (
          <p className="mt-2 text-xs text-admin-muted">
            {selectedClass === NO_CLASS
              ? "Pick a class to add a subject. Subjects here can be moved into a class from their menu."
              : "This class is archived, so new subjects cannot be added to it."}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3">
          <SearchBox
            value={search.subject}
            placeholder="Search subjects..."
            onChange={(v) => setSearch((s) => ({ ...s, subject: v }))}
          />
          {subjects === null ? (
            <CardSkeleton />
          ) : classSubjects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-admin-line/60 px-3 py-6 text-center text-sm text-admin-muted">
              {addBlocked
                ? "No subjects here."
                : `No subjects in ${names.class} yet. Click Add subject to create the first one.`}
            </p>
          ) : subjectList.length === 0 ? (
            <p className="rounded-lg border border-dashed border-admin-line/60 px-3 py-6 text-center text-sm text-admin-muted">
              Nothing matches &quot;{search.subject.trim()}&quot;.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {subjectList.map((s) => (
                <ItemCard
                  key={s.id}
                  icon={<SubjectIcon name={s.name} className="size-5" />}
                  name={s.name}
                  meta={subjectMeta(s.counts)}
                  selected={s.id === selectedSubject}
                  archived={!s.isActive}
                  busy={busyId === s.id}
                  onSelect={() => selectSubject(s.id)}
                  actions={actionsFor("subject", s, undefined, s)}
                />
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <AdminShell title="Question Taxonomy">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-admin-muted">
          Build the structure your questions belong to.
        </p>

        <Stepper current={current} onGoTo={goTo} />
        <StepHint>{hint}</StepHint>

        {notice && (
          <p
            role="status"
            className="rounded-xl border border-admin/30 bg-admin-mint/20 px-4 py-3 text-sm text-admin-ink"
          >
            {notice}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <CardShell>
            {selectedClass ? renderSubjectCard() : renderClassCard()}
          </CardShell>

          <CardShell>{renderRight()}</CardShell>
        </div>

        <StructureCard names={names} current={current} />
      </div>

      {dialog?.kind === "add" && (
        <NameModal
          title={`Add ${dialog.level}`}
          subtitle={addSubtitle(dialog.level, names, unitRow?.isActive)}
          label={`${LEVEL_LABEL[dialog.level]} name`}
          placeholder={
            {
              class: "",
              subject: "e.g. Physics",
              unit: "e.g. Mechanics",
              chapter: "",
              topic: "",
            }[dialog.level]
          }
          context={
            dialog.level === "subject"
              ? { label: "Class", value: names.class }
              : undefined
          }
          submitLabel={`Add ${dialog.level}`}
          onClose={() => setDialog(null)}
          onSubmit={(name) => add(dialog.level, name)}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameModal
          title={`Rename ${dialog.level}`}
          label={`${LEVEL_LABEL[dialog.level]} name`}
          initial={dialog.name}
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSubmit={(name) => rename(dialog.level, dialog.id, name)}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveModal
          title="Move to unit"
          subtitle={`Choose where '${dialog.chapter.name}' should live.`}
          selectLabel="Unit"
          placeholder="Move to unit…"
          noneLabel="No unit"
          currentId={dialog.chapter.unitId ?? null}
          options={activeUnits.map((u) => ({ id: u.id, label: u.name }))}
          errorFallback="Could not move that chapter."
          onClose={() => setDialog(null)}
          onSubmit={(unitId) => move(dialog.chapter, unitId)}
        />
      )}
      {dialog?.kind === "moveSubject" && (
        <MoveModal
          title="Move to class"
          subtitle={`Choose which class '${dialog.subject.name}' belongs to.`}
          selectLabel="Class"
          placeholder="Move to class…"
          noneLabel="No class"
          currentId={dialog.subject.classId ?? null}
          options={catalogueClasses.map((c) => ({
            id: c.id,
            label: labelOfClass(c),
          }))}
          errorFallback="Could not move that subject."
          onClose={() => setDialog(null)}
          onSubmit={(classId) => moveSubject(dialog.subject, classId)}
        />
      )}
    </AdminShell>
  );
}

function addSubtitle(
  level: Level,
  names: Record<Level, string>,
  unitActive?: boolean,
): string | undefined {
  if (level === "unit") return `Adds a unit to ${names.subject}.`;
  if (level === "chapter") {
    return unitActive
      ? `Adds a chapter to ${names.unit}.`
      : `Adds a chapter to ${names.subject} with no unit.`;
  }
  if (level === "topic") return `Adds a topic to ${names.chapter}.`;
  return undefined;
}
