"use client";

import { useCallback, useEffect, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { PlusIcon, XIcon } from "@/components/admin/icons";
import { Panel } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { useKeyedAsyncAction } from "@/hooks/use-async-action";
import { getMyBatches, listSubjects, type Subject } from "@/lib/admin";
import { downloadAttachment, formatBytes, uploadMedia } from "@/lib/media";
import {
  createResource,
  listResources,
  removeResource,
  type ResourceItem,
} from "@/lib/resources";

/** What `GET /staff/me/batches` returns — id and name, nothing more. */
type TeachingBatch = { id: string; name: string };

/**
 * Study material a teacher shares with their batches (§2.12).
 *
 * Filed by subject so it lands in the same taxonomy the question bank uses, and
 * addressed to a batch because that is the unit a teacher teaches. The batch
 * options come from `GET /staff/me/batches`, the teacher's own assignment —
 * `/batches` is ADMIN-only and would 403 here. The server re-checks the choice
 * on publish, so the selector is a convenience rather than the permission.
 */
export default function TeacherResourcesPage() {
  const [items, setItems] = useState<ResourceItem[] | null>(null);
  // `null` while the request is in flight, so the dialog can tell "still
  // loading" apart from "there are none" — they need different words.
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [batches, setBatches] = useState<TeachingBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** Which subject shelf is showing; empty means all of them. */
  const [shelf, setShelf] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listResources());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load resources.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick, the idiom the other staff pages use: setState straight
    // from an effect body trips react-hooks/set-state-in-effect.
    const id = setTimeout(() => {
      void load();
      listSubjects()
        .then(setSubjects)
        .catch(() => setSubjects([]));
      // Only the batches this teacher is assigned to.
      getMyBatches()
        .then(setBatches)
        .catch(() => setBatches([]));
    }, 0);
    return () => clearTimeout(id);
  }, [load]);

  const shelves = [...new Set((items ?? []).map((r) => r.subject.name))].sort();
  const shown = shelf
    ? (items ?? []).filter((r) => r.subject.name === shelf)
    : (items ?? []);

  /**
   * Unshare one resource.
   *
   * Keyed rather than a single `removing` id, which had a real hole: clicking
   * Unshare on a second row overwrote the first row's id, so the first button
   * re-enabled while its DELETE was still in flight — and the first request
   * finishing then re-enabled the second the same way. Both rows ended up
   * clickable during live requests. The keyed lock is synchronous, so only one
   * unshare runs and only its own row is disabled.
   */
  const unshare = useKeyedAsyncAction(
    async (_id: string, item: ResourceItem) => {
      await removeResource(item.id);
      setNotice(`"${item.title}" is no longer shared.`);
      await load();
    },
    {
      onError: (_id, message) => setError(message),
      fallbackMessage: "Could not remove it.",
    },
  );

  function remove(item: ResourceItem) {
    setError(null);
    // Drop the previous "… shared." line: leaving it up while a different
    // item is being unshared reads as if that one succeeded.
    setNotice(null);
    void unshare.run(item.id, item);
  }

  return (
    <TeacherShell title="Resources">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-admin/30 bg-admin/5 px-4 py-3 text-sm text-admin">
          {notice}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={shelf}
          onChange={(e) => setShelf(e.target.value)}
          aria-label="Filter by subject"
          className="h-11 rounded-full border border-admin-line bg-white px-4 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="">All subjects</option>
          {shelves.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setError(null);
            setAdding(true);
          }}
          className="flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />
          Share material
        </button>
      </div>

      <Panel
        title={shelf || "All subjects"}
        subtitle={
          items === null
            ? "Loading…"
            : `${shown.length} file(s) shared with your batches`
        }
      >
        {items === null ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-admin-line/15"
              />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
            Nothing shared yet. Anything you upload here appears in the
            Resources section of every student in the batch you choose.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-line/60 bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-admin-ink">{r.title}</p>
                  {r.description && (
                    <p className="mt-0.5 text-sm text-admin-muted">
                      {r.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-admin-subtle">
                    {r.subject.name} · {r.batch.name} ·{" "}
                    {r.file
                      ? `${r.file.fileName} (${formatBytes(r.file.size)})`
                      : "file missing from the library"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!r.file}
                  onClick={() =>
                    void downloadAttachment(r.mediaKey, r.file?.fileName)
                  }
                  title={
                    r.file ? "Download" : "The file is no longer available"
                  }
                  className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                >
                  Download
                </button>
                <ActionButton
                  loading={unshare.isPending(r.id)}
                  loadingText="Removing…"
                  // Other rows stay usable: these deletes are genuinely
                  // independent, so blocking them would be the "unnecessary"
                  // kind of blocking.
                  onClick={() => remove(r)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/5 disabled:opacity-50"
                >
                  Unshare
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {adding && (
        <ShareDialog
          subjects={subjects}
          batches={batches}
          onClose={() => setAdding(false)}
          onShared={(title) => {
            setAdding(false);
            setNotice(`"${title}" shared.`);
            void load();
          }}
          onError={setError}
        />
      )}
    </TeacherShell>
  );
}

/**
 * Upload, then file.
 *
 * Two steps on purpose: the upload is a multipart request that can fail on size
 * or type, and pairing it with the metadata would mean re-typing the title
 * every time a file was rejected.
 */
function ShareDialog({
  subjects,
  batches,
  onClose,
  onShared,
  onError,
}: {
  subjects: Subject[] | null;
  batches: TeachingBatch[] | null;
  onClose: () => void;
  onShared: (title: string) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = title.trim().length >= 2 && subjectId && batchId && file;

  async function share() {
    if (!valid || !file) return;
    setBusy(true);
    try {
      const uploaded = await uploadMedia(file, undefined, "DOCUMENT");
      await createResource({
        title: title.trim(),
        description: description.trim() || undefined,
        subjectId,
        batchId,
        mediaKey: uploaded.key,
      });
      onShared(title.trim());
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Could not share the file.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-admin-ink">
              Share study material
            </h2>
            <p className="mt-1 text-sm text-admin-muted">
              Students in the batch you choose can download this from their
              Resources section.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rotational motion — formula sheet"
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-y rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase text-admin-muted">
                Subject
              </span>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
              >
                <option value="">
                  {subjects === null
                    ? "Loading subjects…"
                    : subjects.length === 0
                      ? "No subjects in the taxonomy"
                      : "Select a subject"}
                </option>
                {(subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase text-admin-muted">
                Batch
              </span>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
              >
                <option value="">
                  {batches === null
                    ? "Loading your batches…"
                    : batches.length === 0
                      ? "You teach no batches yet"
                      : "Select a batch"}
                </option>
                {(batches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              File
            </span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-admin-muted file:mr-3 file:rounded-lg file:border file:border-admin-line file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-admin-ink hover:file:bg-admin-bg"
            />
            <span className="text-xs text-admin-subtle">
              PDF, Word, Excel, PowerPoint, TXT, CSV or an image. Up to 25 MB.
            </span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void share()}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Sharing…" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
