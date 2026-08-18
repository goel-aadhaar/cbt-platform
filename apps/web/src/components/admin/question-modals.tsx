"use client";

import { useRef, useState } from "react";

import {
  type DocxImportSummary,
  type Difficulty,
  type QuestionType,
  importQuestionsDocx,
} from "@/lib/questions";

import {
  AlertTriangleIcon,
  CheckIcon,
  CloudUploadIcon,
  DownloadIcon,
  XIcon,
} from "./icons";

function Shell({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/40"
      />
      <div
        className={`relative w-full ${wide ? "max-w-[680px]" : "max-w-[540px]"} overflow-hidden rounded-2xl bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-admin-line/60 px-7 py-5">
          <h2 className="text-xl font-bold text-admin-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-7 py-6">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-7 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

const IMPORT_DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const IMPORT_TYPES: QuestionType[] = ["MCQ", "MSQ", "INTEGER"];

/**
 * Bulk-import questions from a .docx upload, wired to POST /questions/import.
 * Each question in the file must start with "Q:" or a number ("1."), with
 * options as "A) …" and the correct answer as "Answer: …" — the same contract
 * the backend parser documents. Subject/chapter/difficulty/type/exam here are
 * only fallbacks applied to rows that omit that field.
 */
export function QuestionImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: (summary: DocxImportSummary) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [type, setType] = useState<QuestionType | "">("");
  const [examType, setExamType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DocxImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const doc = [
      "Q: What is the SI unit of force?",
      "A) Joule",
      "B) Newton",
      "C) Watt",
      "D) Pascal",
      "Answer: B",
      "",
      "Q: Select all prime numbers.",
      "A) 2",
      "B) 4",
      "C) 5",
      "D) 9",
      "Answer: A, C",
      "",
      "Q: What is 12 + 7?",
      "Answer: 19",
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([doc], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "drsk-questions-template.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importQuestionsDocx(file, {
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        ...(chapter.trim() ? { chapter: chapter.trim() } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(type ? { type } : {}),
        ...(examType.trim() ? { examType: examType.trim() } : {}),
      });
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
    setSubject("");
    setChapter("");
    setDifficulty("");
    setType("");
    setExamType("");
    onClose();
  }

  if (!open) return null;
  return (
    <Shell
      title="Import Questions"
      onClose={reset}
      wide
      footer={
        <>
          <button
            onClick={reset}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            {summary ? "Done" : "Cancel"}
          </button>
          {!summary && (
            <button
              onClick={upload}
              disabled={!file || busy}
              className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
            >
              {busy ? "Importing…" : "Import questions"}
            </button>
          )}
        </>
      }
    >
      {summary ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-admin/30 bg-admin/5 p-4">
            <p className="font-bold text-admin">
              Imported {summary.imported.length} of {summary.total} questions
            </p>
            {summary.failed.length > 0 && (
              <p className="mt-1 text-sm text-danger">
                {summary.failed.length} question(s) failed.
              </p>
            )}
          </div>
          {summary.failed.length > 0 && (
            <div className="rounded-xl border border-danger/20 bg-danger-soft/20 p-3">
              {summary.failed.slice(0, 8).map((f) => (
                <p key={f.index} className="text-sm text-danger">
                  #{f.index}: {f.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-admin-line bg-admin-bg px-6 py-10 text-center hover:bg-admin/3"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
              <CloudUploadIcon className="size-6" />
            </span>
            <p className="mt-4 text-lg font-bold text-admin-ink">
              {file ? file.name : "Click to upload a .docx file"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-admin-muted">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB — click to replace`
                : 'Each question starts with "Q:" or a number, options as "A) …", answer as "Answer: …" · max 5 MB'}
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <p className="mt-4">
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-sm font-semibold text-admin-2"
            >
              <DownloadIcon className="mr-1 inline size-4" /> Download format
              example
            </button>
          </p>

          <p className="mt-6 text-sm font-bold text-admin-ink">
            Defaults for rows that omit a field (optional)
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="Chapter"
              className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
            <input
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              placeholder="Exam type"
              className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}
              className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
            >
              <option value="">Difficulty</option>
              {IMPORT_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType | "")}
              className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin"
            >
              <option value="">Type</option>
              {IMPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              <AlertTriangleIcon className="size-4 shrink-0" /> {error}
            </p>
          )}
        </>
      )}
    </Shell>
  );
}

const FORMATS = [
  { id: "csv", label: "CSV", desc: "Comma-separated, best for spreadsheets" },
  { id: "xlsx", label: "XLSX", desc: "Native Excel workbook" },
  { id: "pdf", label: "PDF", desc: "Print-ready question paper" },
];

const SCOPES = ["Current filter", "Selected questions", "Entire question bank"];

export function QuestionExportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [fmt, setFmt] = useState("csv");
  const [scope, setScope] = useState(0);
  const [withAnswers, setWithAnswers] = useState(true);
  if (!open) return null;

  return (
    <Shell
      title="Export Questions"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            disabled
            title="Question bank export has no backend endpoint yet — exam results can already be exported from the Results page"
            className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DownloadIcon className="size-4" /> Export
          </button>
        </>
      }
    >
      <p className="text-sm font-semibold text-admin-muted">Format</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFmt(f.id)}
            className={`rounded-xl border p-3 text-left ${fmt === f.id ? "border-admin bg-admin-mint/15" : "border-admin-line/60 hover:bg-admin-bg"}`}
          >
            <p className="font-bold text-admin-ink">{f.label}</p>
            <p className="mt-0.5 text-xs text-admin-muted">{f.desc}</p>
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm font-semibold text-admin-muted">Scope</p>
      <div className="mt-2 flex flex-col gap-2">
        {SCOPES.map((s, i) => (
          <button
            key={s}
            onClick={() => setScope(i)}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm ${scope === i ? "border-admin bg-admin-mint/10" : "border-admin-line/60 hover:bg-admin-bg"}`}
          >
            <span
              className={`flex size-4 items-center justify-center rounded-full border ${scope === i ? "border-admin bg-admin" : "border-admin-line"}`}
            >
              {scope === i && (
                <span className="size-1.5 rounded-full bg-white" />
              )}
            </span>
            <span className="text-admin-ink">{s}</span>
          </button>
        ))}
      </div>

      <label className="mt-6 flex cursor-pointer items-center gap-3">
        <span
          onClick={() => setWithAnswers((v) => !v)}
          className={`flex size-5 items-center justify-center rounded border ${withAnswers ? "border-admin bg-admin text-white" : "border-admin-line"}`}
        >
          {withAnswers && <CheckIcon className="size-3.5" />}
        </span>
        <span className="text-sm text-admin-ink">
          Include correct answers &amp; rationale
        </span>
      </label>
    </Shell>
  );
}
