"use client";

import { useEffect, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { useAsyncAction } from "@/hooks/use-async-action";

import {
  archiveInstructionTemplate,
  createInstructionTemplate,
  listInstructionTemplates,
  updateInstructionTemplate,
  type InstructionTemplate,
} from "@/lib/instruction-templates";

import { PlusIcon, XIcon } from "./icons";
import { RichTextEditor } from "./rich-text-editor";

/**
 * Admin-managed catalogue of reusable exam instructions (§ exam authoring) —
 * a teacher picks one from the exam wizard's "Use a template" select and can
 * edit it freely afterwards; editing/archiving a template here never touches
 * an exam that already copied its text.
 */
export function InstructionTemplatesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<InstructionTemplate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deliberately does NOT auto-select the first template once it loads: this
  // fetch can resolve well after the modal opens, and unconditionally
  // selecting into it would silently blow away a "New template" click (or
  // any other selection) the user already made in the meantime.
  useEffect(() => {
    if (!open) return;
    listInstructionTemplates()
      .then((r) => setItems(r.items))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load templates.");
        setItems([]);
      });
  }, [open]);

  function select(t: InstructionTemplate) {
    setSelectedId(t.id);
    setCreating(false);
    setName(t.name);
    setContent(t.content);
    setError(null);
  }

  function startCreate() {
    setSelectedId(null);
    setCreating(true);
    setName("");
    setContent("");
    setError(null);
  }

  async function save() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (creating) {
        const created = await createInstructionTemplate({
          name: name.trim(),
          content,
        });
        setItems((prev) => sortByName([...(prev ?? []), created]));
        select(created);
      } else if (selectedId) {
        const updated = await updateInstructionTemplate(selectedId, {
          name: name.trim(),
          content,
        });
        setItems((prev) =>
          sortByName(
            (prev ?? []).map((t) => (t.id === selectedId ? updated : t)),
          ),
        );
        select(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Archive or restore a template. Wrapped so the button can say which of the
   * two is happening and refuse a second click — archiving twice is harmless
   * but the silence made people click again to check it had worked.
   */
  const toggle = useAsyncAction(
    async (t: InstructionTemplate) => {
      const updated = t.isActive
        ? await archiveInstructionTemplate(t.id)
        : await updateInstructionTemplate(t.id, { isActive: true });
      setItems((prev) =>
        sortByName((prev ?? []).map((x) => (x.id === t.id ? updated : x))),
      );
      if (selectedId === t.id) select(updated);
      return updated;
    },
    {
      onError: setError,
      fallbackMessage: "Could not update the template.",
    },
  );

  if (!open) return null;

  const dirty = creating || selectedId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative flex h-[min(680px,85vh)] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* List */}
        <div className="flex w-64 shrink-0 flex-col border-r border-admin-line/60">
          <div className="flex items-center justify-between border-b border-admin-line/60 px-4 py-4">
            <h2 className="text-sm font-bold text-admin-ink">
              Instruction Templates
            </h2>
            <button
              type="button"
              onClick={startCreate}
              title="New template"
              className="flex size-7 items-center justify-center rounded-full bg-admin text-white hover:opacity-95"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {items === null ? (
              <p className="p-3 text-sm text-admin-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-3 text-sm text-admin-muted">
                No templates yet — create one to get started.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => select(t)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        selectedId === t.id
                          ? "bg-admin/10 font-semibold text-admin"
                          : "text-admin-ink hover:bg-admin-bg"
                      } ${!t.isActive ? "opacity-50" : ""}`}
                    >
                      {t.name}
                      {!t.isActive && (
                        <span className="ml-1.5 text-xs text-admin-subtle">
                          (archived)
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-admin-line/60 px-6 py-4">
            <h3 className="text-sm font-bold text-admin-ink">
              {creating
                ? "New template"
                : selectedId
                  ? "Edit template"
                  : "Select a template"}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>

          {dirty ? (
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-admin-ink">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard NEET Rules"
                  className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
                />
              </label>
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-sm font-semibold text-admin-ink">
                  Content
                </span>
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Instructions shown to candidates before they start."
                />
              </div>

              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-admin-line/60 pt-4">
                {!creating && selectedId && (
                  <ActionButton
                    loading={toggle.pending}
                    loadingText={
                      items?.find((x) => x.id === selectedId)?.isActive
                        ? "Archiving…"
                        : "Restoring…"
                    }
                    onClick={() => {
                      const t = items?.find((x) => x.id === selectedId);
                      if (t) void toggle.run(t);
                    }}
                    className="flex items-center gap-2 rounded-lg border border-admin-line px-4 py-2 text-sm font-bold text-admin-muted hover:bg-admin-bg disabled:opacity-60"
                  >
                    {items?.find((x) => x.id === selectedId)?.isActive
                      ? "Archive"
                      : "Restore"}
                  </ActionButton>
                )}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !name.trim() || !content.trim()}
                  className="ml-auto rounded-lg bg-admin px-6 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-admin-muted">
              Select a template on the left, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
