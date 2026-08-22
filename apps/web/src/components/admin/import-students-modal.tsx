"use client";

import { useRef, useState } from "react";

import {
  downloadStudentTemplate,
  importStudentRoster,
  type ImportSummary,
} from "@/lib/admin";

import { Picker, useAcademicCascade } from "./academic-cascade";

import {
  CloudUploadIcon,
  DownloadIcon,
  HistoryIcon,
  UploadIcon,
  XIcon,
} from "./icons";

/**
 * Bulk-import students from an Excel workbook or CSV (Figma 9:6962), wired to
 * POST /students/import.
 *
 * Excel is what schools actually keep rosters in, so it is the primary path —
 * asking an office to re-save as CSV is where a bulk import goes wrong (lost
 * leading zeros, mangled encodings, the wrong delimiter for the machine's
 * locale). CSV still works for anyone who prefers it.
 *
 * The backend requires a target `batchId` and `name` + `email` columns. Roll
 * numbers are always server-generated ({yy}{institute code}{sequence}, §2.11) —
 * a rollNumber column, if present, is ignored. Each row goes through the normal
 * invitation flow, so imported students land in PENDING. Max upload is 10 MB.
 */
/** How many rows to list before summarising the rest. */
const IMPORTED_SHOWN = 8;
const FAILURES_SHOWN = 5;

export function ImportStudentsModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: (summary: ImportSummary) => void;
}) {
  /**
   * Programme -> class -> batch, narrowed one step at a time.
   *
   * A flat list of every batch in the institute was ambiguous to the point of
   * being unusable: batch names are only unique *within a class* and class
   * names only within a programme, so "23b1" or "Batch A" can appear several
   * times over with nothing to tell them apart. Picking the wrong one enrols a
   * whole roster into another programme's cohort, and the mistake only surfaces
   * later, when those candidates see the wrong exams.
   *
   * Only `batchId` is submitted, so the API contract is unchanged.
   */
  const org = useAcademicCascade(open);
  const batchId = org.batchId;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The template comes from the API rather than being built here, so its
   * columns are generated from the same names the parser reads and cannot
   * drift out of date. It carries worked example rows and a "How to use" sheet.
   */
  async function downloadTemplate() {
    try {
      await downloadStudentTemplate();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not download the template.",
      );
    }
  }

  /**
   * Hand back the rejected rows as a file.
   *
   * On a 500-row roster the on-screen list can only ever be a sample, and
   * re-typing what it showed is not a workflow. This is the list of what to
   * fix, in the same shape as the file that was uploaded.
   */
  function downloadFailures() {
    if (!summary) return;
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      "row,email,reason",
      ...summary.failed.map((f) =>
        [f.row, esc(f.email), esc(f.reason)].join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "codonmind-student-import-failures.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    if (!file || !batchId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importStudentRoster(file, { batchId });
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
                Upload an Excel file (.xlsx) or CSV to bulk add students to a
                batch.
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
                      {summary.imported.slice(0, IMPORTED_SHOWN).map((r) => (
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
                  {summary.imported.length > IMPORTED_SHOWN && (
                    <p className="border-t border-admin-line/60 px-3 py-2 text-xs text-admin-muted">
                      …and {summary.imported.length - IMPORTED_SHOWN} more
                      imported successfully.
                    </p>
                  )}
                </div>
              )}
              {summary.failed.length > 0 && (
                <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">
                  {summary.failed.slice(0, FAILURES_SHOWN).map((f) => (
                    <p key={f.row} className="text-danger">
                      Row {f.row} ({f.email}): {f.reason}
                    </p>
                  ))}
                  {/*
                    Never let the list end without saying it was cut short: the
                    rows that failed are exactly what the admin has to go and
                    fix, and a silently truncated list looks like the whole of
                    the problem.
                  */}
                  {summary.failed.length > FAILURES_SHOWN && (
                    <p className="mt-2 font-semibold text-danger">
                      …and {summary.failed.length - FAILURES_SHOWN} more.
                      Download the failed rows to see them all.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={downloadFailures}
                    className="mt-3 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/10"
                  >
                    Download failed rows (CSV)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Picker
                  label="Programme"
                  value={org.programId}
                  onChange={org.pickProgram}
                  options={org.programs}
                  placeholder={org.programPlaceholder}
                />
                <Picker
                  label="Class"
                  value={org.classId}
                  onChange={org.pickClass}
                  options={org.classes}
                  disabled={!org.programId}
                  placeholder={org.classPlaceholder}
                />
                <Picker
                  label="Batch"
                  value={org.batchId}
                  onChange={org.setBatchId}
                  options={org.batches}
                  disabled={!org.classId}
                  placeholder={org.batchPlaceholder}
                />
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-admin/40 px-6 py-12 text-center hover:bg-admin/[0.03]"
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
                  <CloudUploadIcon className="size-7" />
                </span>
                <span className="mt-4 text-lg font-bold text-admin-ink">
                  {file ? file.name : "Click to upload an Excel file or CSV"}
                </span>
                <span className="mt-1 text-sm text-admin-muted">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB — click to replace`
                    : "Columns: name, email · roll numbers are assigned automatically · max 10 MB"}
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                hidden
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />

              <div className="mt-4 flex items-center gap-6 text-sm font-semibold text-admin">
                <button
                  onClick={() => void downloadTemplate()}
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
