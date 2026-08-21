"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlusIcon } from "@/components/admin/icons";
import { Panel, StatusPill } from "@/components/staff/charts";
import {
  archiveBatch,
  archiveClass,
  archiveProgram,
  createBatch,
  createClass,
  createProgram,
  listBatches,
  listClasses,
  listPrograms,
  renameBatch,
  renameClass,
  renameProgram,
  type BatchRow,
  type ClassRow,
  type Program,
} from "@/lib/admin";

type Level = "program" | "class" | "batch";
type NamedItem = { id: string; name: string; isActive: boolean };

/**
 * Program → Class → Batch is the enrollment hierarchy (§2.11) that student
 * invites, CSV import and exam batch-assignment all pick from — those pickers
 * already existed (add-student-drawer, import-students-modal), but nothing
 * could create the rows they list. Three Miller columns: picking a program
 * scopes the class column, picking a class scopes the batch column.
 */
export default function OrganizationPage() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [batches, setBatches] = useState<BatchRow[] | null>(null);

  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    level: Level;
    rename?: { id: string; name: string };
  } | null>(null);

  // This is the screen that *manages* the taxonomy, so it asks for archived
  // entries too — everywhere else (pickers, drawers) takes the active-only
  // default, which is what archiving is supposed to mean.
  useEffect(() => {
    listPrograms(true)
      .then(setPrograms)
      .catch((e: unknown) => {
        setError(msg(e, "Could not load programs"));
        setPrograms([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedProgram) return;
    listClasses(selectedProgram, true)
      .then(setClasses)
      .catch((e: unknown) => {
        setError(msg(e, "Could not load classes"));
        setClasses([]);
      });
  }, [selectedProgram]);

  useEffect(() => {
    if (!selectedClass) return;
    listBatches(selectedClass, true)
      .then(setBatches)
      .catch((e: unknown) => {
        setError(msg(e, "Could not load batches"));
        setBatches([]);
      });
  }, [selectedClass]);

  function selectProgram(id: string) {
    setSelectedProgram(id);
    setSelectedClass(null);
    setClasses(null);
    setBatches(null);
  }

  function selectClass(id: string) {
    setSelectedClass(id);
    setBatches(null);
  }

  async function submitCreate(level: Level, name: string) {
    if (level === "program") {
      const p = await createProgram(name);
      setPrograms((prev) => sortByName([...(prev ?? []), p]));
      setNotice(`Program "${p.name}" created.`);
    } else if (level === "class") {
      if (!selectedProgram) throw new Error("Select a program first.");
      const c = await createClass(selectedProgram, name);
      setClasses((prev) => sortByName([...(prev ?? []), c]));
      setNotice(`Class "${c.name}" created.`);
    } else {
      if (!selectedClass) throw new Error("Select a class first.");
      const b = await createBatch(selectedClass, name);
      setBatches((prev) => sortByName([...(prev ?? []), b]));
      setNotice(`Batch "${b.name}" created.`);
    }
    setModal(null);
  }

  async function submitRename(level: Level, id: string, name: string) {
    if (level === "program") {
      const p = await renameProgram(id, name);
      setPrograms((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === id ? p : x))),
      );
      setNotice(`Renamed to "${p.name}".`);
    } else if (level === "class") {
      const c = await renameClass(id, name);
      setClasses((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === id ? c : x))),
      );
      setNotice(`Renamed to "${c.name}".`);
    } else {
      const b = await renameBatch(id, name);
      setBatches((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === id ? b : x))),
      );
      setNotice(`Renamed to "${b.name}".`);
    }
    setModal(null);
  }

  async function archive(level: Level, id: string, name: string) {
    const downstream =
      level === "program"
        ? "classes"
        : level === "class"
          ? "batches"
          : "students";
    if (
      !window.confirm(
        `Archive "${name}"? It stops appearing for new ${downstream === "students" ? "enrollments" : downstream}, but existing ${downstream} keep the reference.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      if (level === "program") {
        const p = await archiveProgram(id);
        setPrograms((prev) => (prev ?? []).map((x) => (x.id === id ? p : x)));
      } else if (level === "class") {
        const c = await archiveClass(id);
        setClasses((prev) => (prev ?? []).map((x) => (x.id === id ? c : x)));
      } else {
        const b = await archiveBatch(id);
        setBatches((prev) => (prev ?? []).map((x) => (x.id === id ? b : x)));
      }
      setNotice(`${name} archived.`);
    } catch (e: unknown) {
      setError(msg(e, `Could not archive "${name}"`));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Organization">
      <p className="mb-6 max-w-2xl text-sm text-admin-muted">
        Programs, classes and batches are the enrollment hierarchy — every
        student is invited into a batch, which belongs to a class, which belongs
        to a program. Archiving keeps existing references intact; it only stops
        an item from being offered for new ones.
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
          title={programs ? `${programs.length} Programs` : "Programs"}
          subtitle="Top-level track, e.g. NEET or JEE"
          action={<NewButton onClick={() => setModal({ level: "program" })} />}
        >
          {programs === null ? (
            <Skeleton />
          ) : programs.length === 0 ? (
            <Empty text="No programs yet. Create one to get started." />
          ) : (
            <ul className="flex flex-col gap-2">
              {programs.map((p) => (
                <Row
                  key={p.id}
                  item={p}
                  selectable
                  selected={p.id === selectedProgram}
                  busy={busyId === p.id}
                  onSelect={() => selectProgram(p.id)}
                  onRename={() =>
                    setModal({
                      level: "program",
                      rename: { id: p.id, name: p.name },
                    })
                  }
                  onArchive={() => void archive("program", p.id, p.name)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            selectedProgram
              ? classes
                ? `${classes.length} Classes`
                : "Classes"
              : "Classes"
          }
          subtitle={
            selectedProgram
              ? "Grade or year within the program"
              : "Select a program first"
          }
          action={
            <NewButton
              disabled={!selectedProgram}
              onClick={() => setModal({ level: "class" })}
            />
          }
        >
          {!selectedProgram ? (
            <Empty text="Select a program to see its classes." />
          ) : classes === null ? (
            <Skeleton />
          ) : classes.length === 0 ? (
            <Empty text="No classes yet in this program." />
          ) : (
            <ul className="flex flex-col gap-2">
              {classes.map((c) => (
                <Row
                  key={c.id}
                  item={c}
                  selectable
                  selected={c.id === selectedClass}
                  busy={busyId === c.id}
                  onSelect={() => selectClass(c.id)}
                  onRename={() =>
                    setModal({
                      level: "class",
                      rename: { id: c.id, name: c.name },
                    })
                  }
                  onArchive={() => void archive("class", c.id, c.name)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            selectedClass
              ? batches
                ? `${batches.length} Batches`
                : "Batches"
              : "Batches"
          }
          subtitle={
            selectedClass
              ? "Section students enroll into"
              : "Select a class first"
          }
          action={
            <NewButton
              disabled={!selectedClass}
              onClick={() => setModal({ level: "batch" })}
            />
          }
        >
          {!selectedClass ? (
            <Empty text="Select a class to see its batches." />
          ) : batches === null ? (
            <Skeleton />
          ) : batches.length === 0 ? (
            <Empty text="No batches yet in this class." />
          ) : (
            <ul className="flex flex-col gap-2">
              {batches.map((b) => (
                <Row
                  key={b.id}
                  item={b}
                  busy={busyId === b.id}
                  onRename={() =>
                    setModal({
                      level: "batch",
                      rename: { id: b.id, name: b.name },
                    })
                  }
                  onArchive={() => void archive("batch", b.id, b.name)}
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
      setError(msg(err, "Something went wrong"));
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
  return level === "program"
    ? "program"
    : level === "class"
      ? "class"
      : "batch";
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
