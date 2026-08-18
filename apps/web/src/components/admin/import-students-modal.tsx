"use client";

import { useEffect, useRef, useState } from "react";

import {
  importStudentsCsv,
  listBatches,
  type BatchRow,
  type ImportSummary,
} from "@/lib/admin";

import {
  CloudUploadIcon,
  DownloadIcon,
  HistoryIcon,
  UploadIcon,
  XIcon,
} from "./icons";

/**
 * Bulk-import students from CSV (Figma 9:6962), wired to POST /students/import.
 *
 * The backend requires a target `batchId` and a CSV with `name` + `email`
 * columns. Roll numbers are always server-generated
 * ({yy}{institute code}{sequence}, §2.11) — a rollNumber column, if present,
 * is ignored. Each row goes through the normal invitation flow, so imported
 * students land in PENDING. Max upload is 2 MB (backend limit), and only CSV is
 * accepted — the design's "XLSX / 50MB" copy overstated both.
 */
export function ImportStudentsModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: (summary: ImportSummary) => void;
}) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchId, setBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listBatches()
      .then((b) => !cancelled && setBatches(b))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load batches."),
      );
    return () => {
      cancelled = true;
    };
  }, [open]);

  function downloadTemplate() {
    const csv = "name,email\nJane Doe,jane@example.com\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "drsk-students-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    if (!file || !batchId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importStudentsCsv(file, { batchId });
      setSummary(res);
      onImported?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setSummary(null);
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        aria-label="Close"
        onClick={reset}
        className="absolute inset-0 bg-admin-ink/40"
      />

      <div className="relative w-full max-w-[660px] overflow-hidden rounded-2xl bg-white shadow-2xl [font-family:var(--font-hanken)]">
        <div className="flex items-start justify-between px-8 pb-4 pt-8">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-xl bg-admin-mint/50 text-admin">
              <UploadIcon className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-admin-ink">
                Import Students
              </h2>
              <p className="text-sm text-admin-muted">
                Upload a CSV to bulk add students to a batch.
              </p>
            </div>
          </div>
          <button
            onClick={reset}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto px-8 pb-4">
          {summary ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-admin/30 bg-admin/5 p-4">
                <p className="font-bold text-admin">
                  Imported {summary.imported.length} of {summary.total} rows
                  into {summary.batch}
                </p>
                {summary.failed.length > 0 && (
                  <p className="mt-1 text-sm text-danger">
                    {summary.failed.length} row(s) failed.
                  </p>
                )}
              </div>
              {summary.imported.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-admin-line/60">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-admin-bg/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Roll</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-line/50">
                      {summary.imported.slice(0, 8).map((r) => (
                        <tr key={r.row}>
                          <td className="px-3 py-2 text-admin-muted">
                            {r.row}
                          </td>
                          <td className="px-3 py-2 text-admin-ink">{r.name}</td>
                          <td className="px-3 py-2 [font-family:var(--font-courier-prime)] text-admin-muted">
                            {r.rollNumber}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {summary.failed.length > 0 && (
                <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">
                  {summary.failed.slice(0, 5).map((f) => (
                    <p key={f.row} className="text-danger">
                      Row {f.row} ({f.email}): {f.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <label className="mb-4 flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-admin-ink">
                  Target batch<span className="ml-0.5 text-danger">*</span>
                </span>
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
                >
                  <option value="">Select batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-admin/40 px-6 py-12 text-center hover:bg-admin/[0.03]"
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
                  <CloudUploadIcon className="size-7" />
                </span>
                <span className="mt-4 text-lg font-bold text-admin-ink">
                  {file ? file.name : "Click to upload a CSV"}
                </span>
                <span className="mt-1 text-sm text-admin-muted">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB — click to replace`
                    : "Columns: name, email · roll numbers are assigned automatically · max 2 MB"}
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />

              <div className="mt-4 flex items-center gap-6 text-sm font-semibold text-admin">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 hover:underline"
                >
                  <DownloadIcon className="size-4" /> Download template
                </button>
                <a
                  href="/admin/imports"
                  className="flex items-center gap-2 hover:underline"
                >
                  <HistoryIcon className="size-4" /> View Import History
                </a>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                >
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-4 border-t border-admin-line/60 px-8 py-5">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            {summary ? "Done" : "Cancel"}
          </button>
          {!summary && (
            <button
              onClick={upload}
              disabled={!file || !batchId || busy}
              className="rounded-lg bg-admin px-6 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:bg-admin/40"
            >
              {busy ? "Importing…" : "Import students"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
