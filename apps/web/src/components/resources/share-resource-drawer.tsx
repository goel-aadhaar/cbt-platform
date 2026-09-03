"use client";

import { useEffect, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { XIcon } from "@/components/admin/icons";
import { LoadingSpinner } from "@/components/loading-spinner";
import { listChapters, type ChapterRow } from "@/lib/admin";
import { formatBytes, uploadMedia } from "@/lib/media";
import {
  createResource,
  parseYoutubeId,
  updateResource,
  youtubeThumbnailUrl,
  type ResourceItem,
  type ResourceType,
} from "@/lib/resources";

interface Option {
  id: string;
  name: string;
}

/**
 * Share or edit one piece of study material.
 *
 * Two kinds behind one form, because everything except the payload is the same
 * question: what is it called, where does it belong, who gets it.
 *
 * The file is uploaded BEFORE the resource is created, which is why the two
 * steps are visible in the UI: the upload is a multipart request that can fail
 * on type or size, and pairing it with the metadata would make a rejected file
 * cost the teacher everything else they had typed.
 */
export function ShareResourceDrawer({
  open,
  editing,
  subjects,
  batches,
  defaultSubjectId,
  defaultChapterId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null to share something new. */
  editing: ResourceItem | null;
  subjects: Option[];
  /** Only batches this teacher may publish to — the server checks again. */
  batches: Option[];
  defaultSubjectId?: string;
  defaultChapterId?: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // Initialised from props rather than reset by an effect: the parent gives
  // this component a fresh key per open, so every field starts correct on
  // mount and a previous share cannot bleed into the next one.
  const [type, setType] = useState<ResourceType>(editing?.type ?? "FILE");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [subjectId, setSubjectId] = useState(
    editing?.subject.id ?? defaultSubjectId ?? "",
  );
  const [chapterId, setChapterId] = useState(
    editing?.chapter?.id ?? defaultChapterId ?? "",
  );
  const [chapters, setChapters] = useState<{
    forSubject: string;
    rows: ChapterRow[];
  } | null>(null);
  const [batchIds, setBatchIds] = useState<string[]>(
    editing?.batches.map((b) => b.id) ?? [],
  );
  const [youtubeUrl, setYoutubeUrl] = useState(
    editing?.youtubeVideoId
      ? `https://www.youtube.com/watch?v=${editing.youtubeVideoId}`
      : "",
  );

  const [file, setFile] = useState<File | null>(null);
  const [mediaKey, setMediaKey] = useState<string | null>(
    editing?.mediaKey ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chapters follow the chosen subject — showing every chapter in the
  // institute would invite exactly the mismatched pair the server rejects.
  //
  // The fetched rows remember which subject they are FOR, so a stale list is
  // detected by comparison instead of by clearing state on the way in.
  useEffect(() => {
    if (!open || !subjectId) return;
    let cancelled = false;
    listChapters(subjectId)
      .then((rows) => {
        if (!cancelled) setChapters({ forSubject: subjectId, rows });
      })
      .catch(() => {
        if (!cancelled) setChapters({ forSubject: subjectId, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, subjectId]);

  const chapterRows =
    chapters && chapters.forSubject === subjectId ? chapters.rows : null;

  // Close on Escape, like every other drawer in the console.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const videoId = type === "YOUTUBE" ? parseYoutubeId(youtubeUrl) : null;
  const youtubeLooksWrong =
    type === "YOUTUBE" && youtubeUrl.trim() !== "" && !videoId;

  async function handleFile(picked: File | null) {
    setFile(picked);
    setMediaKey(null);
    setUploadError(null);
    if (!picked) return;
    setUploading(true);
    try {
      // DOCUMENT, not IMAGE: different allow-list and size cap, enforced by
      // the media module rather than restated here.
      const uploaded = await uploadMedia(picked, undefined, "DOCUMENT");
      setMediaKey(uploaded.key);
      if (!title.trim()) {
        // A sensible default the teacher can overwrite — most files are
        // already named after what they are.
        setTitle(picked.name.replace(/\.[^.]+$/, ""));
      }
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  function validate(): string | null {
    if (title.trim().length < 2) return "Give it a title.";
    if (!subjectId) return "Choose a subject.";
    if (!chapterId) return "Choose a chapter.";
    if (batchIds.length === 0)
      return "Choose at least one batch to share with.";
    if (type === "FILE" && !mediaKey) return "Upload a file first.";
    if (type === "YOUTUBE" && !videoId) {
      return "Paste a YouTube video link (youtube.com/watch, youtu.be or /shorts).";
    }
    return null;
  }

  async function save() {
    if (saving) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateResource(editing.id, {
          title: title.trim(),
          description: description.trim(),
          subjectId,
          chapterId,
          batchIds,
          ...(type === "FILE"
            ? mediaKey && mediaKey !== editing.mediaKey
              ? { mediaKey }
              : {}
            : { youtubeUrl: youtubeUrl.trim() }),
        });
      } else {
        await createResource({
          title: title.trim(),
          description: description.trim() || undefined,
          type,
          subjectId,
          chapterId,
          batchIds,
          ...(type === "FILE"
            ? { mediaKey: mediaKey! }
            : { youtubeUrl: youtubeUrl.trim() }),
        });
      }
      await onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not share this.");
    } finally {
      setSaving(false);
    }
  }

  const toggleBatch = (id: string) =>
    setBatchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit material" : "Share material"}
        className="relative flex h-full w-full max-w-lg flex-col overflow-auto bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-admin-line px-5 py-4">
          <h2 className="text-lg font-bold text-admin-ink">
            {editing ? "Edit material" : "Share material"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 px-5 py-5">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {/* Type — locked while editing: switching a file into a video would
              leave the old payload orphaned and the new one unset. */}
          {!editing && (
            <div>
              <span className="text-xs font-bold uppercase text-admin-muted">
                Type
              </span>
              <div className="mt-2 flex gap-2">
                {(["FILE", "YOUTUBE"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={type === t}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                      type === t
                        ? "border-admin bg-admin/10 text-admin"
                        : "border-admin-line text-admin-muted hover:bg-admin-bg"
                    }`}
                  >
                    {t === "FILE" ? "File" : "YouTube video"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === "FILE" ? (
            <div>
              <label
                htmlFor="resource-file"
                className="text-xs font-bold uppercase text-admin-muted"
              >
                File
              </label>
              <input
                id="resource-file"
                type="file"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-lg border border-admin-line px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-admin file:px-3 file:py-1.5 file:text-white"
              />
              {uploading && (
                <p className="mt-2 flex items-center gap-2 text-sm text-admin-muted">
                  <LoadingSpinner size={16} /> Uploading…
                </p>
              )}
              {uploadError && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {uploadError}
                </p>
              )}
              {file && mediaKey && (
                <p className="mt-2 text-sm text-admin-ink">
                  ✓ {file.name}{" "}
                  <span className="text-admin-muted">
                    ({formatBytes(file.size)})
                  </span>
                </p>
              )}
              {!file && editing?.file && (
                <p className="mt-2 text-sm text-admin-muted">
                  Currently {editing.file.fileName} — choose a file to replace
                  it.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label
                htmlFor="resource-url"
                className="text-xs font-bold uppercase text-admin-muted"
              >
                YouTube link
              </label>
              <input
                id="resource-url"
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                aria-invalid={youtubeLooksWrong}
                className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
              />
              {youtubeLooksWrong && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  That is not a YouTube video link. Paste a youtube.com/watch,
                  youtu.be or youtube.com/shorts URL.
                </p>
              )}
              {videoId && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-admin-line p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={youtubeThumbnailUrl(videoId)}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded object-cover"
                  />
                  <p className="text-sm text-admin-muted">
                    Video looks good. Students will see it embedded here.
                  </p>
                </div>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
              placeholder="Kinematics — complete notes"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase text-admin-muted">
                Subject
              </span>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  // The old chapter belongs to the old subject; keeping it
                  // would submit a pair the server rejects.
                  setChapterId("");
                }}
                className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
              >
                <option value="">Select…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-admin-muted">
                Chapter
              </span>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                disabled={!subjectId || chapterRows === null}
                className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin disabled:bg-admin-bg disabled:text-admin-muted"
              >
                <option value="">
                  {!subjectId
                    ? "Choose a subject first"
                    : chapterRows === null
                      ? "Loading…"
                      : chapterRows.length === 0
                        ? "No chapters in this subject"
                        : "Select…"}
                </option>
                {(chapterRows ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="text-xs font-bold uppercase text-admin-muted">
              Share with
            </span>
            {batches.length === 0 ? (
              <p className="mt-2 text-sm text-admin-muted">
                You are not assigned to any batches yet, so there is nobody to
                share with. Ask an administrator to assign you.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {batches.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 text-sm text-admin-ink"
                  >
                    <input
                      type="checkbox"
                      checked={batchIds.includes(b.id)}
                      onChange={() => toggleBatch(b.id)}
                      className="size-4 accent-admin"
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
          </div>
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
            onClick={() => void save()}
            disabled={saving || uploading}
          >
            {saving
              ? "Sharing…"
              : editing
                ? "Save changes"
                : type === "FILE"
                  ? "Share resource"
                  : "Share video"}
          </ActionButton>
        </footer>
      </div>
    </div>
  );
}
