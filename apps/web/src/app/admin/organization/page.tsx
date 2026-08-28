"use client";

import { useEffect, useRef, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlusIcon } from "@/components/admin/icons";
import { AuthedImage } from "@/components/authed-image";
import { Panel, StatusPill } from "@/components/staff/charts";
import { useMyInstitute } from "@/hooks/use-my-institute";
import { uploadMedia } from "@/lib/media";
import {
  renameMyInstitute,
  setMyInstituteCache,
  setMyInstituteLogo,
} from "@/lib/platform";
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
  refreshOrgCatalogue,
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

  /**
   * The institute identity card — the shared cache (see `useMyInstitute`),
   * not a page-local copy, so a rename/logo change here is reflected in the
   * sidebar rendered by this very page immediately, with no extra fetch.
   * The four-digit code is shown but never editable — it is embedded in
   * every student roll number this institute has ever issued, and changing
   * it retroactively would orphan the roll numbers themselves.
   */
  const { institute } = useMyInstitute();
  const [renamingInstitute, setRenamingInstitute] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
    // The shared catalogue (add-student drawer, batch pickers elsewhere) is
    // stale the moment this succeeds — force it to re-fetch rather than
    // leave every other consumer showing last session's rows.
    refreshOrgCatalogue();
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
    refreshOrgCatalogue();
  }

  async function renameInstitute(name: string) {
    if (!institute) return;
    setRenamingInstitute(true);
    setError(null);
    try {
      const next = await renameMyInstitute(name.trim());
      setMyInstituteCache(next);
      setNotice("Institute renamed.");
    } catch (e: unknown) {
      setError(msg(e, "Could not rename the institute."));
    } finally {
      setRenamingInstitute(false);
    }
  }

  /**
   * Upload-then-attach (§ institute branding): the file goes to the general
   * media library first (same call the question picker uses), then its key
   * is attached to the institute in a second, tiny request. Every workspace
   * shell already polls `GET /institutes/me` on its own, so a fresh sign-in
   * or reload elsewhere picks the new logo up without any extra plumbing.
   */
  async function changeLogo(file: File) {
    setSavingLogo(true);
    setError(null);
    try {
      const uploaded = await uploadMedia(file, "Institute logo", "IMAGE");
      const next = await setMyInstituteLogo(uploaded.key);
      setMyInstituteCache(next);
      setNotice("Logo updated.");
    } catch (e: unknown) {
      setError(msg(e, "Could not update the logo."));
    } finally {
      setSavingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setSavingLogo(true);
    setError(null);
    try {
      const next = await setMyInstituteLogo(null);
      setMyInstituteCache(next);
      setNotice("Logo removed — back to the default mark.");
    } catch (e: unknown) {
      setError(msg(e, "Could not remove the logo."));
    } finally {
      setSavingLogo(false);
    }
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
      refreshOrgCatalogue();
    } catch (e: unknown) {
      setError(msg(e, `Could not archive "${name}"`));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Enrollments">
      {institute && (
        <section className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-admin-line/60 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {/* Logo (§ institute branding) — every member sees whatever is set
              here; clearing it falls back to the platform default mark. */}
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-admin-line/60 bg-admin-bg/40">
            {institute.logoUrl ? (
              <AuthedImage
                url={institute.logoUrl}
                alt=""
                className="size-full object-contain"
              />
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-subtle">
                No logo
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Your institute
            </p>
            <p className="text-2xl font-bold text-admin-ink">
              {institute.name}
            </p>
            <p className="text-xs text-admin-subtle">
              Slug <span className="font-mono">{institute.slug}</span> · Code{" "}
              <span className="font-mono">{institute.code}</span> · Since{" "}
              {new Date(institute.createdAt).toLocaleDateString()}
            </p>
          </div>
          <StatusPill tone={institute.isActive ? "good" : "muted"}>
            {institute.isActive ? "Active" : "Suspended"}
          </StatusPill>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void changeLogo(file);
            }}
          />
          <button
            type="button"
            disabled={savingLogo}
            onClick={() => logoInputRef.current?.click()}
            className="rounded-md border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            {savingLogo
              ? "Saving…"
              : institute.logoUrl
                ? "Change Logo"
                : "Upload Logo"}
          </button>
          {institute.logoUrl && (
            <button
              type="button"
              disabled={savingLogo}
              onClick={() => void removeLogo()}
              className="rounded-md border border-admin-line px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/5 disabled:opacity-50"
            >
              Remove Logo
            </button>
          )}
          <button
            type="button"
            disabled={renamingInstitute}
            onClick={() => {
              const next = window.prompt("Rename institute", institute.name);
              if (next?.trim() && next.trim() !== institute.name) {
                void renameInstitute(next);
              }
            }}
            className="rounded-md border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Rename
          </button>
        </section>
      )}

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
