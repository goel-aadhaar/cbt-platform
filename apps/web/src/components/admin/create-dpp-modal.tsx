"use client";

import { useEffect, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { type BatchOption, BatchPicker } from "@/components/batch-picker";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  listChapters,
  listSubjects,
  type ChapterRow,
  type Subject,
} from "@/lib/admin";
import { createDpp, updateDpp, type DppItem } from "@/lib/dpp";

import { XIcon } from "./icons";

/**
 * Create — or edit the SHARING of — a DPP (§ Product Structure).
 *
 * Creation is the direct flow the spec requires: Question Bank → filter →
 * select → name it → assign batches → Create DPP. No intermediate "add to
 * Practice Bank" step: `questionIds` are exactly what the caller ticked in
 * the bank, in that order.
 *
 * Editing (`editing` set) reuses the same form for title/description/
 * subject/chapter/batches, matching the rest of the console's one-form-does-
 * both convention (e.g. ShareResourceDrawer). It deliberately does not
 * re-open question selection — changing a DPP's question set is a bigger
 * decision than fixing its title or who it's shared with, and belongs back
 * at the Question Bank, not in a quick edit dialog.
 */
export function CreateDppModal({
  open,
  questionIds,
  batches,
  editing,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Exactly the questions ticked in the Question Bank, in tick order.
   * Ignored when `editing` is set. */
  questionIds: string[];
  /** Batches this caller may share with — the server checks again. */
  batches: BatchOption[];
  /** Set to edit an existing DPP's sharing instead of creating a new one. */
  editing?: DppItem | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [subjectId, setSubjectId] = useState(editing?.subject?.id ?? "");
  const [chapterId, setChapterId] = useState(editing?.chapter?.id ?? "");
  const [batchIds, setBatchIds] = useState<string[]>(
    editing?.batches.map((b) => b.id) ?? [],
  );
  const [subjects, setSubjects] = useState<Subject[]>([]);
  // Remembers which subject the rows answer, so a stale fetch from a subject
  // the caller has already changed away from is detected by comparison
  // rather than by clearing state on the way into the effect (which would be
  // a synchronous setState in an effect body).
  const [chapters, setChapters] = useState<{
    forSubject: string;
    rows: ChapterRow[];
  } | null>(null);

  // Nothing here reads from a previous open — creation always starts blank —
  // so there is no reset-on-open effect: the caller remounts this component
  // with a fresh `key` each time it opens (see the teacher/admin pages),
  // which is what makes every field start empty without one.
  useEffect(() => {
    if (!open) return;
    listSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [open]);

  const chapterRows =
    chapters && chapters.forSubject === subjectId ? chapters.rows : null;

  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    listChapters(subjectId)
      .then(
        (rows) => !cancelled && setChapters({ forSubject: subjectId, rows }),
      )
      .catch(
        () => !cancelled && setChapters({ forSubject: subjectId, rows: [] }),
      );
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const action = useAsyncAction(async () => {
    const shared = {
      title: title.trim(),
      description: description.trim() || undefined,
      subjectId: subjectId || undefined,
      chapterId: chapterId || undefined,
      batchIds,
    };
    if (editing) {
      await updateDpp(editing.id, shared);
    } else {
      await createDpp({ ...shared, questionIds });
    }
    onCreated();
    onClose();
  });

  if (!open) return null;

  const canSubmit = title.trim().length >= 2 && batchIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-admin-line px-5 py-4">
          <h2 className="text-lg font-bold text-admin-ink">
            {editing ? "Edit DPP" : "Create DPP"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-5">
          <p className="mb-4 rounded-lg bg-admin/5 px-3 py-2 text-sm text-admin">
            {editing
              ? `${editing._count.questions} question${editing._count.questions === 1 ? "" : "s"} in this DPP. To change which questions it contains, create a new one from the Question Bank.`
              : `${questionIds.length} question${questionIds.length === 1 ? "" : "s"} selected from the Question Bank.`}
          </p>

          <label className="block">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Plant Kingdom P1 DPP"
              className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase text-admin-muted">
                Subject (optional)
              </span>
              <select
                value={subjectId}
                onChange={(e) => {
                  // A chapter from the OLD subject would silently mislabel
                  // the new one — clear it in the same event that changes
                  // the subject, not in a follow-up effect.
                  setSubjectId(e.target.value);
                  setChapterId("");
                }}
                className="mt-1 h-10 w-full rounded-lg border border-admin-line bg-white px-2.5 text-sm text-admin-ink outline-none focus:border-admin"
              >
                <option value="">Unfiled</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-admin-muted">
                Chapter (optional)
              </span>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                disabled={!subjectId}
                className="mt-1 h-10 w-full rounded-lg border border-admin-line bg-white px-2.5 text-sm text-admin-ink outline-none focus:border-admin disabled:opacity-50"
              >
                <option value="">
                  {!subjectId
                    ? "Choose a subject first"
                    : chapterRows === null
                      ? "Loading…"
                      : "Unfiled"}
                </option>
                {(chapterRows ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Share with
            </span>
            <div className="mt-1">
              <BatchPicker
                batches={batches}
                selected={batchIds}
                onChange={setBatchIds}
                emptyMessage="You have no batches to share with yet."
              />
            </div>
          </div>

          {action.error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {action.error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-admin-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-admin-line px-4 py-2 text-sm font-semibold text-admin-muted hover:bg-admin-bg"
          >
            Cancel
          </button>
          <ActionButton
            onClick={() => void action.run()}
            loading={action.pending}
            disabled={!canSubmit}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editing ? "Save changes" : "Create DPP"}
          </ActionButton>
        </footer>
      </div>
    </div>
  );
}
