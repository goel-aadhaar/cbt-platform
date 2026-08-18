"use client";

import { useState } from "react";

import { ApiError } from "@/lib/api";
import {
  createQuestion,
  type CreateQuestionInput,
  type Difficulty,
  type QuestionType,
} from "@/lib/questions";

import { PlusIcon, XIcon } from "./icons";
import { MediaPicker } from "./media-picker";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const TYPES: { value: QuestionType; label: string }[] = [
  { value: "MCQ", label: "Single Choice" },
  { value: "MSQ", label: "Multi-select" },
  { value: "INTEGER", label: "Numeric" },
];

interface OptionRow {
  key: string;
  text: string;
}

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

const INPUT_CLS =
  "w-full rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin";

function emptyOptions(): OptionRow[] {
  return [
    { key: "A", text: "" },
    { key: "B", text: "" },
  ];
}

/**
 * Author a single question (POST /questions) — the one authoring path the
 * teacher console had no UI for; bulk DOCX import was the only way in.
 * Saved as DRAFT; the teacher sends it for approval afterwards from the
 * question list, same as an imported one.
 */
export function QuestionAuthorDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [type, setType] = useState<QuestionType>("MCQ");
  const [examType, setExamType] = useState("");
  const [tags, setTags] = useState("");
  const [statement, setStatement] = useState("");
  const [options, setOptions] = useState<OptionRow[]>(emptyOptions());
  const [mcqAnswer, setMcqAnswer] = useState("A");
  const [msqAnswer, setMsqAnswer] = useState<string[]>([]);
  const [intAnswer, setIntAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [marks, setMarks] = useState("4");
  const [negativeMarks, setNegativeMarks] = useState("1");
  const [mediaKeys, setMediaKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setSubject("");
    setChapter("");
    setTopic("");
    setDifficulty("MEDIUM");
    setType("MCQ");
    setExamType("");
    setTags("");
    setStatement("");
    setOptions(emptyOptions());
    setMcqAnswer("A");
    setMsqAnswer([]);
    setIntAnswer("");
    setExplanation("");
    setMarks("4");
    setNegativeMarks("1");
    setMediaKeys([]);
    setError(null);
    setDone(false);
    onClose();
  }

  function addOption() {
    setOptions((prev) => {
      const nextKey = OPTION_KEYS[prev.length];
      if (!nextKey) return prev;
      return [...prev, { key: nextKey, text: "" }];
    });
  }

  function removeOption(key: string) {
    setOptions((prev) => prev.filter((o) => o.key !== key));
    setMsqAnswer((prev) => prev.filter((k) => k !== key));
    if (mcqAnswer === key) setMcqAnswer("");
  }

  const needsOptions = type !== "INTEGER";
  const valid =
    subject.trim() &&
    chapter.trim() &&
    examType.trim() &&
    statement.trim() &&
    (type === "INTEGER"
      ? intAnswer.trim() !== "" && !Number.isNaN(Number(intAnswer))
      : options.length >= 2 &&
        options.every((o) => o.text.trim()) &&
        (type === "MCQ" ? mcqAnswer : msqAnswer.length > 0));

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const input: CreateQuestionInput = {
        subject: subject.trim(),
        chapter: chapter.trim(),
        topic: topic.trim() || undefined,
        difficulty,
        type,
        examType: examType.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        statement: statement.trim(),
        options: needsOptions
          ? options.map((o) => ({ key: o.key, text: o.text.trim() }))
          : undefined,
        answerKey:
          type === "INTEGER"
            ? Number(intAnswer)
            : type === "MCQ"
              ? mcqAnswer
              : msqAnswer,
        explanation: explanation.trim() || undefined,
        marks: marks.trim() ? Number(marks) : undefined,
        negativeMarks: negativeMarks.trim() ? Number(negativeMarks) : undefined,
        mediaKeys: mediaKeys.length ? mediaKeys : undefined,
      };
      await createQuestion(input);
      setDone(true);
      onCreated?.();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Could not save the question.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={reset}
        className="absolute inset-0 bg-admin-ink/30"
      />

      <div className="relative flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-admin-line/60 px-8 py-6">
          <h2 className="text-xl font-bold text-admin-ink">
            {done ? "Question saved" : "New Question"}
          </h2>
          <button
            onClick={reset}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-lg font-bold text-admin-ink">
                Saved as a draft
              </p>
              <p className="max-w-sm text-sm text-admin-muted">
                Find it under &quot;My questions&quot; to send it for approval
                whenever you&apos;re ready.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Subject" required>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Chapter" required>
                  <input
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Topic">
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Exam type" required>
                  <input
                    value={examType}
                    onChange={(e) => setExamType(e.target.value)}
                    placeholder="e.g. JEE, NEET"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Difficulty">
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(e.target.value as Difficulty)
                    }
                    className={INPUT_CLS}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type">
                  <select
                    value={type}
                    onChange={(e) => {
                      const next = e.target.value as QuestionType;
                      setType(next);
                      if (next !== "MCQ") setMcqAnswer("");
                      if (next !== "MSQ") setMsqAnswer([]);
                    }}
                    className={INPUT_CLS}
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tags (comma-separated)">
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Marks / Negative marks">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={marks}
                      onChange={(e) => setMarks(e.target.value)}
                      className={INPUT_CLS}
                    />
                    <input
                      type="number"
                      value={negativeMarks}
                      onChange={(e) => setNegativeMarks(e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </Field>
              </div>

              <Field label="Question stem" required>
                <textarea
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  rows={3}
                  className={`${INPUT_CLS} resize-y`}
                />
              </Field>

              {needsOptions ? (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
                    Options — mark the correct{" "}
                    {type === "MCQ" ? "one" : "one or more"}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {options.map((o) => {
                      const correct =
                        type === "MCQ"
                          ? mcqAnswer === o.key
                          : msqAnswer.includes(o.key);
                      return (
                        <div key={o.key} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              type === "MCQ"
                                ? setMcqAnswer(o.key)
                                : setMsqAnswer((prev) =>
                                    prev.includes(o.key)
                                      ? prev.filter((k) => k !== o.key)
                                      : [...prev, o.key],
                                  )
                            }
                            aria-pressed={correct}
                            title="Mark as correct"
                            className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                              correct
                                ? "border-admin bg-admin text-white"
                                : "border-admin-line text-admin-muted hover:border-admin/50"
                            }`}
                          >
                            {o.key}
                          </button>
                          <input
                            value={o.text}
                            onChange={(e) =>
                              setOptions((prev) =>
                                prev.map((row) =>
                                  row.key === o.key
                                    ? { ...row, text: e.target.value }
                                    : row,
                                ),
                              )
                            }
                            placeholder={`Option ${o.key}`}
                            className={`${INPUT_CLS} flex-1`}
                          />
                          {options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(o.key)}
                              aria-label={`Remove option ${o.key}`}
                              className="text-admin-muted hover:text-danger"
                            >
                              <XIcon className="size-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {options.length < OPTION_KEYS.length && (
                      <button
                        type="button"
                        onClick={addOption}
                        className="flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-admin-line px-3 py-1.5 text-xs font-bold text-admin-muted hover:border-admin/50 hover:text-admin"
                      >
                        <PlusIcon className="size-3.5" /> Add option
                      </button>
                    )}
                  </div>
                </section>
              ) : (
                <Field label="Correct answer (number)" required>
                  <input
                    type="number"
                    value={intAnswer}
                    onChange={(e) => setIntAnswer(e.target.value)}
                    className={`${INPUT_CLS} max-w-xs`}
                  />
                </Field>
              )}

              <Field label="Explanation (shown on the result review)">
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={2}
                  className={`${INPUT_CLS} resize-y`}
                />
              </Field>

              <section className="rounded-xl border border-admin-line/60 p-4">
                <MediaPicker selected={mediaKeys} onChange={setMediaKeys} />
              </section>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
          <button
            onClick={reset}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              onClick={save}
              disabled={!valid || saving}
              className="rounded-lg bg-admin px-6 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save as draft"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-admin-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}
