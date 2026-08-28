"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { UploadIcon } from "@/components/admin/icons";
import { PaginationBar } from "@/components/pagination-bar";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface ImportRun {
  id: string;
  kind: "STUDENTS_CSV" | "QUESTIONS_DOCX";
  fileName: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  /** Row-level reasons, capped server-side. */
  failures: { row?: number; index?: number; reason?: string }[];
  target: string | null;
  createdAt: string;
  createdBy: { name: string };
}

/**
 * What was imported, not how.
 *
 * The stored enum values still read `STUDENTS_CSV` / `QUESTIONS_DOCX` because
 * they are database identifiers with history behind them, but both importers
 * now accept several formats — so a run labelled "(CSV)" could perfectly well
 * have been a workbook. The format is visible anyway: the file name is shown
 * beside this and carries the real extension.
 */
const KIND_LABEL: Record<ImportRun["kind"], string> = {
  STUDENTS_CSV: "Students",
  QUESTIONS_DOCX: "Questions",
};

/**
 * Import history. Imports already reported a per-row outcome once and then
 * discarded it; this is the record of what actually happened, with the failed
 * rows kept because those are the ones needing a fix and a re-run.
 */
export default function AdminImportsPage() {
  const [runs, setRuns] = useState<ImportRun[] | null>(null);
  const [runsTotal, setRunsTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const PAGE = 50;
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: ImportRun[]; total: number }>(
      `/imports?limit=${PAGE}&offset=${offset}`,
      { token: getToken() ?? undefined },
    )
      .then((data) => {
        if (!cancelled) {
          setRuns(data.items);
          setRunsTotal(data.total);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load import history",
        );
        setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  return (
    <AdminShell title="Imports">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-admin-ink">
              Import history
            </h2>
            <p className="mt-1 text-sm text-admin-muted">
              Every student CSV and question DOCX loaded into this institute.
            </p>
          </div>
          <Link
            href="/admin/students?import=1"
            className="flex items-center gap-2 rounded-full bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            <UploadIcon className="size-4" />
            Import students
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {runs === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-admin-line/60 bg-admin-line/10"
              />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin/10 text-admin">
              <UploadIcon className="size-6" />
            </span>
            <p className="mt-4 text-base font-bold text-admin-ink">
              No imports yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
              Student CSV and question DOCX uploads will be recorded here, with
              any rows that failed.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {runs.map((r) => {
              const partial = r.failedRows > 0 && r.importedRows > 0;
              const total = r.totalRows || 1;
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-admin-line/60 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-bold text-admin-ink">
                          {r.fileName}
                        </p>
                        <span className="rounded-full bg-admin-line/30 px-2.5 py-0.5 text-[11px] font-bold uppercase text-admin-muted">
                          {KIND_LABEL[r.kind]}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                            r.failedRows === 0
                              ? "bg-admin-mint/60 text-admin"
                              : partial
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                          }`}
                        >
                          {r.failedRows === 0
                            ? "Success"
                            : partial
                              ? "Partial"
                              : "Failed"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-admin-muted">
                        {r.target ? `${r.target} · ` : ""}
                        {new Date(r.createdAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · by {r.createdBy.name}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-admin-ink">
                        {r.importedRows}/{r.totalRows} imported
                      </p>
                      {r.failedRows > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpen((o) => (o === r.id ? null : r.id))
                          }
                          className="mt-1 text-xs font-semibold text-red-700 hover:underline"
                        >
                          {open === r.id ? "Hide" : "Show"} {r.failedRows}{" "}
                          failed
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-admin-line/30">
                    <div
                      className="h-full rounded-full bg-admin"
                      style={{
                        width: `${(r.importedRows / total) * 100}%`,
                      }}
                    />
                  </div>

                  {open === r.id && r.failures.length > 0 && (
                    <ul className="mt-4 space-y-1.5 rounded-xl bg-red-50/60 p-4">
                      {r.failures.map((f, i) => (
                        <li key={i} className="text-xs text-red-800">
                          <span className="font-semibold">
                            Row {f.row ?? f.index ?? i + 1}:
                          </span>{" "}
                          {f.reason ?? "Failed"}
                        </li>
                      ))}
                      {r.failedRows > r.failures.length && (
                        <li className="text-xs italic text-red-700">
                          …and {r.failedRows - r.failures.length} more (only the
                          first {r.failures.length} are kept).
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {runs !== null && runs.length > 0 && (
          <PaginationBar
            offset={offset}
            pageSize={PAGE}
            total={runsTotal}
            onOffsetChange={setOffset}
            itemLabel="imports"
          />
        )}
      </div>
    </AdminShell>
  );
}
