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
 * Subject → Chapter → Topic is the question-bank taxonomy (§2.4) the
 * authoring drawer's cascading dropdowns pick from — mirrors the
 * Program → Class → Batch Miller-column browser in `admin/organization`.
 */
export default function QuestionTaxonomyPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [topics, setTopics] = useState<TopicRow[] | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    level: Level;
    rename?: { id: string; name: string };
  } | null>(null);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch((e: unknown) => {
        setError(msg(e, "Could not load subjects"));
        setSubjects([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    listChapters(selectedSubject)
      .then(setChapters)
      .catch((e: unknown) => {
        setError(msg(e, "Could not load chapters"));
        setChapters([]);
      });
  }, [selectedSubject]);

  useEffect(() => {
    if (!selectedChapter) return;
    listTopics(selectedChapter)
      .then(setTopics)
      .catch((e: unknown) => {
        setError(msg(e, "Could not load topics"));
        setTopics([]);
      });
  }, [selectedChapter]);

  function selectSubject(id: string) {
    setSelectedSubject(id);
    setSelectedChapter(null);
    setChapters(null);
    setTopics(null);
  }

  function selectChapter(id: string) {
    setSelectedChapter(id);
    setTopics(null);
  }

  async function submitCreate(level: Level, name: string) {
    if (level === "subject") {
      const s = await createSubject(name);
      setSubjects((prev) => sortByName([...(prev ?? []), s]));
      setNotice(`Subject "${s.name}" created.`);
    } else if (level === "chapter") {
      if (!selectedSubject) throw new Error("Select a subject first.");
      const c = await createChapter(selectedSubject, name);
      setChapters((prev) => sortByName([...(prev ?? []), c]));
      setNotice(`Chapter "${c.name}" created.`);
    } else {
      if (!selectedChapter) throw new Error("Select a chapter first.");
      const t = await createTopic(selectedChapter, name);
      setTopics((prev) => sortByName([...(prev ?? []), t]));
      setNotice(`Topic "${t.name}" created.`);
    }
    setModal(null);
  }

  async function submitRename(level: Level, id: string, name: string) {
    if (level === "subject") {
      const s = await renameSubject(id, name);
      setSubjects((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === id ? s : x))),
      );
      setNotice(`Renamed to "${s.name}".`);
    } else if (level === "chapter") {
      const c = await renameChapter(id, name);
      setChapters((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === id ? c : x))),
      );
      setNotice(`Renamed to "${c.name}".`);
    } else {
      const t = await renameTopic(id, name);
      setTopics((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === id ? t : x))),
      );
      setNotice(`Renamed to "${t.name}".`);
    }
    setModal(null);
  }

  async function archive(level: Level, id: string, name: string) {
    const downstream =
      level === "subject"
        ? "chapters"
        : level === "chapter"
          ? "topics"
          : "questions";
    if (
      !window.confirm(
        `Archive "${name}"? It stops appearing in the authoring dropdowns, but existing ${downstream} keep the reference.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      if (level === "subject") {
        const s = await archiveSubject(id);
        setSubjects((prev) => (prev ?? []).map((x) => (x.id === id ? s : x)));
      } else if (level === "chapter") {
        const c = await archiveChapter(id);
        setChapters((prev) => (prev ?? []).map((x) => (x.id === id ? c : x)));
      } else {
        const t = await archiveTopic(id);
        setTopics((prev) => (prev ?? []).map((x) => (x.id === id ? t : x)));
      }
      setNotice(`${name} archived.`);
    } catch (e: unknown) {
      setError(msg(e, `Could not archive "${name}"`));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Question Taxonomy">
      <p className="mb-6 max-w-2xl text-sm text-admin-muted">
        Subjects, chapters and topics are the hierarchy the question-authoring
        drawer&apos;s dropdowns pick from — every question belongs to a chapter,
        which belongs to a subject. Archiving keeps existing references intact;
        it only stops an item from being offered for new questions.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-admin/30 bg-admin/5 px-4 py-3 text-sm font-semibold text-admin">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          title={subjects ? `${subjects.length} Subjects` : "Subjects"}
          subtitle="Top-level subject, e.g. Physics"
          action={<NewButton onClick={() => setModal({ level: "subject" })} />}
        >
          {subjects === null ? (
            <Skeleton />
          ) : subjects.length === 0 ? (
            <Empty text="No subjects yet. Create one to get started." />
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
                  onRename={() =>
                    setModal({
                      level: "subject",
                      rename: { id: s.id, name: s.name },
                    })
                  }
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
              ? "Chapter within the subject"
              : "Select a subject first"
          }
          action={
            <NewButton
              disabled={!selectedSubject}
              onClick={() => setModal({ level: "chapter" })}
            />
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
                  onSelect={() => selectChapter(c.id)}
                  onRename={() =>
                    setModal({
                      level: "chapter",
                      rename: { id: c.id, name: c.name },
                    })
                  }
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
              ? "Optional finer breakdown of the chapter"
              : "Select a chapter first"
          }
          action={
            <NewButton
              disabled={!selectedChapter}
              onClick={() => setModal({ level: "topic" })}
            />
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
                  onRename={() =>
                    setModal({
                      level: "topic",
                      rename: { id: t.id, name: t.name },
                    })
                  }
                  onArchive={() => void archive("topic", t.id, t.name)}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {modal && (
        <NameModal
          title={
            modal.rename
              ? `Rename ${labelFor(modal.level)}`
              : `New ${labelFor(modal.level)}`
          }
          initial={modal.rename?.name ?? ""}
          submitLabel={modal.rename ? "Save" : "Create"}
          onClose={() => setModal(null)}
          onSubmit={(name) =>
            modal.rename
              ? submitRename(modal.level, modal.rename.id, name)
              : submitCreate(modal.level, name)
          }
        />
      )}
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
  busy: boolean;
  onSelect?: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${
        selected ? "border-admin bg-admin/5" : "border-admin-line/60"
      } ${busy ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        disabled={!selectable}
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
          selectable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="truncate font-semibold text-admin-ink">
          {item.name}
        </span>
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
          disabled={busy}
          onClick={onArchive}
          className="rounded-md px-2 py-1 text-xs font-bold text-danger hover:bg-danger/5 disabled:opacity-50"
        >
          Archive
        </button>
      </span>
    </li>
  );
}

function NameModal({
  title,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err: unknown) {
      setError(
        msg(
          err,
          "That was not saved. Try again — if it keeps failing, reload the page.",
        ),
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-admin-ink">{title}</h2>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              minLength={1}
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-admin-line px-4 py-2 text-sm font-bold text-admin-ink hover:bg-admin-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || name.trim().length < 1}
              className="rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full bg-admin px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <PlusIcon className="size-3.5" />
      New
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-admin-line p-6 text-center text-sm text-admin-muted">
      {text}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg bg-admin-line/15"
        />
      ))}
    </div>
  );
}

function labelFor(level: Level): string {
  return level === "subject"
    ? "subject"
    : level === "chapter"
      ? "chapter"
      : "topic";
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
