"use client";

import { useEffect, useState } from "react";

import {
  listChapters,
  listSubjects,
  listTopics,
  type ChapterRow,
  type Subject,
  type TopicRow,
} from "@/lib/admin";
import { useAuthUser } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { listExamCategories, type ExamCategory } from "@/lib/exam-categories";
import {
  createQuestion,
  updateQuestion,
  usedInExams,
  type AffectedExam,
  type QuestionDetail,
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
/**
 * Authoring drawer, used for both new questions and edits.
 *
 * `PATCH /questions/:id` has always been implemented — with a used-in-exams
 * safeguard and, since the answer-key fix, automatic re-scoring — but nothing
 * in the app called it. A question with a wrong answer key could not be
 * corrected through the UI at all; the only route was to archive it and author
 * a replacement, which loses its history and leaves concluded papers scored
 * against the bad key.
 *
 * The parent remounts this via `key` when the target changes, so the state
 * below is seeded once per question rather than resynced by an effect.
 */
export function QuestionAuthorDrawer({
  open,
  onClose,
  onCreated,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Provide to edit an existing question; omit to author a new one. */
  editing?: QuestionDetail | null;
}) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [topics, setTopics] = useState<TopicRow[] | null>(null);
  const [examCategories, setExamCategories] = useState<ExamCategory[] | null>(
    null,
  );
  const [subjectId, setSubjectId] = useState(editing?.subjectId ?? "");
  const [chapterId, setChapterId] = useState(editing?.chapterId ?? "");
  const [topicId, setTopicId] = useState(editing?.topicId ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(
    editing?.difficulty ?? "MEDIUM",
  );
  const [type, setType] = useState<QuestionType>(editing?.type ?? "MCQ");
  const [examCategoryId, setExamCategoryId] = useState(
    editing?.examCategoryId ?? "",
  );
  const [tags, setTags] = useState((editing?.tags ?? []).join(", "));
  const [statement, setStatement] = useState(editing?.statement ?? "");
  const [options, setOptions] = useState<OptionRow[]>(
    editing?.options?.length
      ? editing.options.map((o) => ({ key: o.key, text: o.text }))
      : emptyOptions(),
  );
  const [mcqAnswer, setMcqAnswer] = useState(
    typeof editing?.answerKey === "string" ? editing.answerKey : "A",
  );
  const [msqAnswer, setMsqAnswer] = useState<string[]>(
    Array.isArray(editing?.answerKey) ? editing.answerKey : [],
  );
  const [intAnswer, setIntAnswer] = useState(
    typeof editing?.answerKey === "number" ? String(editing.answerKey) : "",
  );
  const [explanation, setExplanation] = useState(editing?.explanation ?? "");
  const [marks, setMarks] = useState(String(editing?.marks ?? 4));
  const [negativeMarks, setNegativeMarks] = useState(
    String(editing?.negativeMarks ?? 1),
  );
  const [mediaKeys, setMediaKeys] = useState<string[]>(
    editing?.mediaKeys ?? [],
  );
  /**
   * An admin's question is approved on save rather than queued, so the button
   * must not promise a draft. Saying "Save as draft" and then publishing it is
   * the same class of untruth as a control that does nothing.
   */
  const isAdmin = useAuthUser()?.role === "ADMIN";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /**
   * Exams this edit would re-score, from a 409 the server raised. Holding them
   * here turns the refusal into a confirmation step instead of an error the
   * author cannot get past.
   */
  const [affected, setAffected] = useState<AffectedExam[] | null>(null);
  const [recalculated, setRecalculated] = useState<number | null>(null);

  function reset() {
    setSubjectId("");
    setChapterId("");
    setTopicId("");
    setChapters(null);
    setTopics(null);
    setDifficulty("MEDIUM");
    setType("MCQ");
    setExamCategoryId("");
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

  // Subject and exam-category catalogues load once the drawer opens; chapter
  // and topic cascade off whichever parent is currently selected.
  useEffect(() => {
    if (!open) return;
    listSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
    listExamCategories(true)
      .then((r) => setExamCategories(r.items))
      .catch(() => setExamCategories([]));
  }, [open]);

  useEffect(() => {
    if (!subjectId) return;
    listChapters(subjectId)
      .then(setChapters)
      .catch(() => setChapters([]));
  }, [subjectId]);

  useEffect(() => {
    if (!chapterId) return;
    listTopics(chapterId)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [chapterId]);

  function selectSubject(id: string) {
    setSubjectId(id);
    setChapterId("");
    setTopicId("");
    setChapters(null);
    setTopics(null);
  }

  function selectChapter(id: string) {
    setChapterId(id);
    setTopicId("");
    setTopics(null);
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
    subjectId &&
    chapterId &&
    statement.trim() &&
    (type === "INTEGER"
      ? intAnswer.trim() !== "" && !Number.isNaN(Number(intAnswer))
      : options.length >= 2 &&
        options.every((o) => o.text.trim()) &&
        (type === "MCQ" ? mcqAnswer : msqAnswer.length > 0));

  async function save(confirm = false) {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const input: CreateQuestionInput = {
        subjectId,
        chapterId,
        topicId: topicId || undefined,
        difficulty,
        type,
        examCategoryId: examCategoryId || undefined,
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
      if (editing) {
        const res = await updateQuestion(editing.id, { ...input, confirm });
        setRecalculated(
          res.recalculated?.reduce((n, r) => n + r.evaluated, 0) ?? 0,
        );
      } else {
        await createQuestion(input);
      }
      setAffected(null);
      setDone(true);
      onCreated?.();
    } catch (e) {
      // Not an error the author can do anything about by retrying — it is the
      // server asking whether they meant to touch a question that has already
      // been sat. Show which papers, and let them decide.
      const exams = usedInExams(e);
      if (exams) {
        setAffected(exams);
      } else {
        setError(
          e instanceof ApiError || e instanceof Error
            ? e.message
            : "Could not save the question.",
        );
      }
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
            {done
              ? "Question saved"
              : editing
                ? "Edit Question"
                : "New Question"}
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
                {editing
                  ? "Changes saved"
                  : isAdmin
                    ? "Added to the question bank"
                    : "Saved as a draft"}
              </p>
              <p className="max-w-sm text-sm text-admin-muted">
                {editing
                  ? recalculated
                    ? `${recalculated} result(s) were re-scored because the answer key changed. Published results were updated in place, not withdrawn.`
                    : "Nothing needed re-scoring — this edit does not change how the question marks."
                  : 'Find it under "My questions" to send it for approval whenever you\'re ready.'}
              </p>
            </div>
          ) : affected ? (
            /*
              The server refused because this question has already been sat.
              That is a safeguard, not a failure: an answer-key change re-scores
              concluded papers. Show exactly which, then let the author decide.
            */
            <div className="flex flex-col gap-4 py-6">
              <p className="text-lg font-bold text-admin-ink">
                This question has already been used
              </p>
              <p className="text-sm text-admin-muted">
                {affected.length} exam(s) include it. If your change affects the
                answer key, the type or the options, those papers will be
                re-scored immediately — ranks and percentiles included.
                Already-published results are updated in place rather than
                withdrawn.
              </p>
              <ul className="flex flex-col gap-2 rounded-xl border border-admin-line bg-admin-bg/40 p-4">
                {affected.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-semibold text-admin-ink">
                      {e.title}
                    </span>
                    <span className="text-xs uppercase text-admin-muted">
                      {e.status}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(true)}
                  className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save and re-score"}
                </button>
                <button
                  type="button"
                  onClick={() => setAffected(null)}
                  className="rounded-lg border border-admin-line px-5 py-2.5 text-sm font-bold text-admin-ink hover:bg-admin-bg"
                >
                  Back to editing
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Subject" required>
                  <select
                    value={subjectId}
                    onChange={(e) => selectSubject(e.target.value)}
                    disabled={subjects === null}
                    className={INPUT_CLS}
                  >
                    <option value="">
                      {subjects === null ? "Loading…" : "Select a subject"}
                    </option>
                    {subjects?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Chapter" required>
                  <select
                    value={chapterId}
                    onChange={(e) => selectChapter(e.target.value)}
                    disabled={!subjectId || chapters === null}
                    className={INPUT_CLS}
                  >
                    <option value="">
                      {!subjectId
                        ? "Select a subject first"
                        : chapters === null
                          ? "Loading…"
                          : "Select a chapter"}
                    </option>
                    {chapters?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Topic">
                  <select
                    value={topicId}
                    onChange={(e) => setTopicId(e.target.value)}
                    disabled={!chapterId || topics === null}
                    className={INPUT_CLS}
                  >
                    <option value="">
                      {!chapterId
                        ? "Select a chapter first"
                        : topics === null
                          ? "Loading…"
                          : "None"}
                    </option>
                    {topics?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Exam type">
                  <select
                    value={examCategoryId}
                    onChange={(e) => setExamCategoryId(e.target.value)}
                    disabled={examCategories === null}
                    className={INPUT_CLS}
                  >
                    <option value="">
                      {examCategories === null ? "Loading…" : "None"}
                    </option>
                    {examCategories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
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
                <Field label="Positive marks / negative marks">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={marks}
                      onChange={(e) => setMarks(e.target.value)}
                      className={INPUT_CLS}
                      aria-describedby="practice-marks-note"
                    />
                    <input
                      type="number"
                      value={negativeMarks}
                      onChange={(e) => setNegativeMarks(e.target.value)}
                      className={INPUT_CLS}
                      aria-describedby="practice-marks-note"
                    />
                  </div>
                  {/*
                    These apply to PRACTICE only.
                    An exam scores every question by its *section's*
                    marksCorrect/marksWrong — that is how an NTA-style paper
                    works, and it is what `evaluate()` reads. The field used to
                    be labelled plainly "Marks", so a teacher could set 5/-2
                    here, see it saved, and reasonably believe the exam would
                    mark it that way. It never did. Labelled rather than
                    honoured: making exam scoring read this field would
                    silently restate every result already published.
                  */}
                  <p
                    id="practice-marks-note"
                    className="mt-1 text-xs text-admin-muted"
                  >
                    Used in the practice library. Exams mark every question by
                    its section&apos;s scheme, set when the paper is built.
                  </p>
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
          {/* Hidden while the used-in-exams confirmation is up: that panel
              carries its own, more explicit, save button. */}
          {!done && !affected && (
            <button
              onClick={() => void save()}
              disabled={!valid || saving}
              className="rounded-lg bg-admin px-6 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : isAdmin
                    ? "Add to question bank"
                    : "Save as draft"}
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
