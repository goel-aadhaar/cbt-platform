"use client";

import {
  CloudUploadIcon,
  DownloadIcon,
  HistoryIcon,
  UploadIcon,
  XIcon,
} from "./icons";

/**
 * Centered modal for bulk-importing students from CSV/XLSX (Figma 9:6962).
 * Presentational — the dropzone/Select File and "Proceed to map fields" are
 * stubs; wiring to POST /students/import comes later.
 */
export function ImportStudentsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/40"
      />

      <div className="relative w-full max-w-[660px] overflow-hidden rounded-2xl bg-white shadow-2xl [font-family:var(--font-hanken)]">
        {/* Header */}
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
                Upload CSV or Excel file to bulk add students to your workspace.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 pb-4">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-admin/40 px-6 py-12 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
              <CloudUploadIcon className="size-7" />
            </span>
            <p className="mt-4 text-lg font-bold text-admin-ink">
              Click to upload or drag and drop
            </p>
            <p className="mt-1 text-sm text-admin-muted">
              Supported formats: CSV, XLSX (Max 50MB)
            </p>
            <button className="mt-5 rounded-lg bg-admin px-6 py-2.5 text-sm font-bold text-white hover:opacity-95">
              Select File
            </button>
          </div>

          <div className="mt-4 flex items-center gap-6 text-sm font-semibold text-admin">
            <button className="flex items-center gap-2 hover:underline">
              <DownloadIcon className="size-4" /> Download template
            </button>
            <button className="flex items-center gap-2 hover:underline">
              <HistoryIcon className="size-4" /> View Import History
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-end gap-4 border-t border-admin-line/60 px-8 py-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-lg bg-admin/40 px-6 py-2.5 text-sm font-bold text-white"
          >
            Proceed to map fields
          </button>
        </div>
      </div>
    </div>
  );
}
