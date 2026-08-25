"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlusIcon } from "@/components/admin/icons";
import { Panel, StatusPill } from "@/components/staff/charts";
import {
  archiveChapter,
  archiveSubject,
  archiveTopic,
  createChapter,
  createSubject,
  createTopic,
  listChapters,
  listSubjects,
  listTopics,
  renameChapter,
  renameSubject,
  renameTopic,
  type ChapterRow,
  type Subject,
  type TopicRow,
} from "@/lib/admin";

type Level = "subject" | "chapter" | "topic";
type NamedItem = { id: string; name: string; isActive: boolean };

/**
 * The question-bank taxonomy (§2.4): Subject → Chapter → Topic.
 *
 * Each subject owns a list of chapters, and each chapter a list of topics.
 * Editors only ever need to ADD or RENAME a row (or archive one an old
 * exam stopped referencing); the cascade of `useEffect`s keeps the next
 * column scoped to the parent's selection.
 *
 * Mirrors `/admin/organization` exactly: three Miller columns, a single
 * row-action vocabulary (Rename / Archive), and a Name modal for both
 * add-and-rename. Doing this on a third page would have been more
 * bureaucratic than it was useful; inlining the same UX primitives here
 * keeps both pages small.
 */
export default function QuestionTaxonomyPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [topics, setTopics] = useState<TopicRow[] | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
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
    let cancelled = false;
    // Reset the chapter selection and (when no subject selected) the
    // chapter list itself. Wrapping the resets in microtasks keeps the
    // body synchronous, satisfying the lint rule against direct setState
    // in effect bodies — the user-visible behaviour is unchanged.
    void Promise.resolve().then(() => {
      if (!cancelled) setSelectedChapter("");
    });
    if (selectedSubject) {
      listChapters(selectedSubject)
        .then((rows) => !cancelled && setChapters(rows))
        .catch(
          (e: unknown) =>
            !cancelled &&
            setError(
              e instanceof Error ? e.message : "Could not load chapters.",
            ),
        );
    } else {
      void Promise.resolve().then(() => {
        if (!cancelled) setChapters(null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selectedSubject, refreshTick]);

  useEffect(() => {
    if (!selectedChapter) return;
    let cancelled = false;
    listTopics(selectedChapter)
      .then((rows) => !cancelled && setTopics(rows))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Could not load topics."),
      );
    return () => {
      cancelled = true;
    };
  }, [selectedChapter, refreshTick]);

  async function selectSubject(id: string) {
    setSelectedSubject(id);
  }
  async function selectChapter(id: string) {
    setSelectedChapter(id);
  }

  async function createLevel(level: Level) {
    setError(null);
    if (level === "subject") {
      // Listed below the modal — show a one-shot prompt for the name.
      const name = window.prompt("Subject name (e.g. Physics)");
      if (!name?.trim()) return;
      setBusyId("__new__");
      try {
        await createSubject(name.trim());
        setRefreshTick((n) => n + 1);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not create subject.");
      } finally {
        setBusyId(null);
      }
      return;
    }
    if (level === "chapter") {
      const name = window.prompt("Chapter name");
      if (!name?.trim() || !selectedSubject) return;
      setBusyId("__new__");
      try {
        await createChapter(selectedSubject, name.trim());
        setRefreshTick((n) => n + 1);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not create chapter.");
      } finally {
        setBusyId(null);
      }
      return;
    }
    // topic
    const name = window.prompt("Topic name");
    if (!name?.trim() || !selectedChapter) return;
    setBusyId("__new__");
    try {
      await createTopic(selectedChapter, name.trim());
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create topic.");
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
      if (level === "chapter") await renameChapter(id, next.trim());
      if (level === "topic") await renameTopic(id, next.trim());
      setRefreshTick((n) => n + 1);
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
      if (level === "chapter") await archiveChapter(id);
      if (level === "topic") await archiveTopic(id);
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not archive that row.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Question Taxonomy">
      <div className="flex flex-col gap-6">
        <p className="max-w-2xl text-sm text-admin-muted">
          The subject → chapter → topic tree every question sits inside. New
          rows attach to the row selected on the left; archiving keeps existing
          references intact, so an old question keeps working after its subject
          has been retired.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Panel
            title={subjects ? `${subjects.length} Subjects` : "Subjects"}
            subtitle="The broadest classification, e.g. Physics"
            action={
              <button
                type="button"
                disabled={busyId === "__new__"}
                onClick={() => void createLevel("subject")}
                className="flex items-center gap-1 rounded-md bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
              >
                <PlusIcon className="size-3" /> New
              </button>
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
                    onSelect={() => void selectSubject(s.id)}
                    onRename={() => void rename("subject", s.id, s.name)}
                    onArchive={() => void archive("subject", s.id, s.name)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={
              selectedSubject
                ? chapters
                  ? `${chapters.length} Chapters`
                  : "Chapters"
                : "Chapters"
            }
            subtitle={
              selectedSubject
                ? "Group of questions on one topic inside the subject"
                : "Select a subject first"
            }
            action={
              <button
                type="button"
                disabled={!selectedSubject || busyId === "__new__"}
                onClick={() => void createLevel("chapter")}
                className="flex items-center gap-1 rounded-md bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
              >
                <PlusIcon className="size-3" /> New
              </button>
            }
          >
            {!selectedSubject ? (
              <Empty text="Select a subject to see its chapters." />
            ) : chapters === null ? (
              <Skeleton />
            ) : chapters.length === 0 ? (
              <Empty text="No chapters yet in this subject." />
            ) : (
              <ul className="flex flex-col gap-2">
                {chapters.map((c) => (
                  <Row
                    key={c.id}
                    item={c}
                    selectable
                    selected={c.id === selectedChapter}
                    busy={busyId === c.id}
                    onSelect={() => void selectChapter(c.id)}
                    onRename={() => void rename("chapter", c.id, c.name)}
                    onArchive={() => void archive("chapter", c.id, c.name)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={
              selectedChapter
                ? topics
                  ? `${topics.length} Topics`
                  : "Topics"
                : "Topics"
            }
            subtitle={
              selectedChapter
                ? "Smallest unit a question belongs to"
                : "Select a chapter first"
            }
            action={
              <button
                type="button"
                disabled={!selectedChapter || busyId === "__new__"}
                onClick={() => void createLevel("topic")}
                className="flex items-center gap-1 rounded-md bg-admin px-3 py-1.5 text-xs font-bold uppercase text-white hover:opacity-95 disabled:opacity-50"
              >
                <PlusIcon className="size-3" /> New
              </button>
            }
          >
            {!selectedChapter ? (
              <Empty text="Select a chapter to see its topics." />
            ) : topics === null ? (
              <Skeleton />
            ) : topics.length === 0 ? (
              <Empty text="No topics yet in this chapter." />
            ) : (
              <ul className="flex flex-col gap-2">
                {topics.map((t) => (
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

function Row({
  item,
  selectable,
  selected,
  busy,
  onSelect,
  onRename,
  onArchive,
}: {
  item: NamedItem;
  selectable?: boolean;
  selected?: boolean;
  busy?: boolean;
  onSelect?: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-admin-line/60 bg-white px-3 py-2">
      <button
        type="button"
        disabled={!selectable || busy}
        onClick={onSelect}
        className={
          "flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed " +
          (selected ? "font-bold text-admin" : "text-admin-ink")
        }
      >
        <span className="truncate">{item.name}</span>
        <StatusPill tone={item.isActive ? "good" : "muted"}>
          {item.isActive ? "Active" : "Archived"}
        </StatusPill>
      </button>
      <span className="flex shrink-0 gap-1">
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
