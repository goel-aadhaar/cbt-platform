"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addQuestionToSection,
  addSection,
  assignBatch,
  createExam,
  listAdmins,
  listBatches,
  listPrograms,
  publishExam,
  scheduleExam,
  submitExamForReview,
  type BatchRow,
  type Program,
  type StaffRow,
} from "@/lib/admin";
import { getUserSnapshot } from "@/lib/auth";
import {
  listQuestions,
  type QuestionFilters,
  type QuestionListItem,
} from "@/lib/questions";

import { CheckIcon, PlusIcon, XIcon } from "./icons";
import { QuestionFilterBar } from "./question-filters";

const ADMIN_STEPS = [
  "Basic Info",
  "Sections",
  "Questions",
  "Schedule",
  "Review",
] as const;

/** A teacher can't schedule or assign batches, so step 4 is the handoff. */
const TEACHER_STEPS = [
  "Basic Info",
  "Sections",
  "Questions",
  "Approval",
  "Review",
] as const;

interface DraftSection {
  name: string;
  marksCorrect: number;
  marksWrong: number;
  /** Question ids chosen for this section (APPROVED only). */
  questionIds: string[];
}

/**
 * "Create New Exam" wizard (Figma 38:9654), wired to the authoring API.
 *
 * Nothing is written until Review → Create Exam; the whole chain then runs in
 * order (exam → sections → questions → batches → schedule → optional publish)
 * so abandoning the wizard can't leave orphaned DRAFT exams behind.
 */
export function ExamBuilderDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (examId: string, title: string) => void;
}) {
  const [step, setStep] = useState(0);

  // Step 1
  const [title, setTitle] = useState("");
  const [durationMinutes, setDuration] = useState(180);
  const [maxViolations, setMaxViolations] = useState(3);
  const [programId, setProgramId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [calculatorEnabled, setCalculator] = useState(false);
  const [fullscreenRequired, setFullscreen] = useState(true);

  // Step 2/3
  const [sections, setSections] = useState<DraftSection[]>([
    { name: "Physics", marksCorrect: 4, marksWrong: 1, questionIds: [] },
  ]);
  const [activeSection, setActiveSection] = useState(0);

  // Step 4
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [publishNow, setPublishNow] = useState(true);

  // Reference data
  // Teachers can author and submit, but cannot assign batches / schedule /
  // publish (those routes are ADMIN-only), so their flow ends at submission.
  const isTeacher = getUserSnapshot()?.role === "TEACHER";
  const [reviewerId, setReviewerId] = useState("");
  const [admins, setAdmins] = useState<StaffRow[]>([]);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [approved, setApproved] = useState<QuestionListItem[]>([]);
  /** Unfiltered sample used to build the filter dropdowns' options. */
  const [facetSource, setFacetSource] = useState<QuestionListItem[]>([]);
  const [filters, setFilters] = useState<QuestionFilters>({});
  const [qLoading, setQLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Teachers can't read some admin-only lookups (programs, batches), so each
    // call is settled independently — one 403 must not blank the whole wizard.
    Promise.allSettled([
      listPrograms(),
      isTeacher ? Promise.resolve([] as BatchRow[]) : listBatches(),
      listQuestions({ status: "APPROVED", limit: 200 }),
      isTeacher ? listAdmins() : Promise.resolve([] as StaffRow[]),
    ]).then(([p, b, q, a]) => {
      if (cancelled) return;
      if (p.status === "fulfilled") setPrograms(p.value);
      if (b.status === "fulfilled") setBatches(b.value);
      if (a.status === "fulfilled") setAdmins(a.value);
      if (q.status === "fulfilled") {
        setApproved(q.value.items);
        setFacetSource(q.value.items);
        setRefError(null);
      } else {
        // Surface why it failed — a 403 (wrong role) and an unreachable API
        // need completely different fixes.
        setRefError(
          q.reason instanceof Error
            ? `Could not load the approved question bank: ${q.reason.message}`
            : "Could not load the approved question bank.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, isTeacher]);

  // Re-query the bank whenever a filter changes. Filtering happens server-side
  // so this scales past the page size, unlike filtering the loaded array.
  useEffect(() => {
    if (!open) return;
    const active = Object.values(filters).some(Boolean);
    if (!active) return;
    let cancelled = false;
    listQuestions({ ...filters, status: "APPROVED", limit: 200 })
      .then((r) => {
        if (!cancelled) {
          setApproved(r.items);
          setQLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApproved([]);
          setQLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, filters]);

  const totalQuestions = useMemo(
    () => sections.reduce((n, s) => n + s.questionIds.length, 0),
    [sections],
  );

  const canAdvance = (() => {
    if (step === 0) return title.trim().length >= 2 && durationMinutes > 0;
    if (step === 1)
      return sections.length > 0 && sections.every((s) => s.name.trim());
    if (step === 2) return totalQuestions > 0;
    if (step === 3)
      return isTeacher
        ? reviewerId !== ""
        : batchIds.length > 0 && Boolean(startAt) && Boolean(endAt);
    return true;
  })();

  const STEPS = isTeacher ? TEACHER_STEPS : ADMIN_STEPS;

  function reset() {
    setStep(0);
    setTitle("");
    setDuration(180);
    setMaxViolations(3);
    setProgramId("");
    setInstructions("");
    setSections([
      { name: "Physics", marksCorrect: 4, marksWrong: 1, questionIds: [] },
    ]);
    setActiveSection(0);
    setBatchIds([]);
    setStartAt("");
    setEndAt("");
    setPublishNow(true);
    setError(null);
    setProgress(null);
  }

  /** Runs the full authoring chain in dependency order. */
  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      setProgress("Creating exam…");
      const exam = await createExam({
        title: title.trim(),
        durationMinutes,
        maxViolations,
        calculatorEnabled,
        fullscreenRequired,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(programId ? { programId } : {}),
      });

      // Each call is a separate round-trip (the API has no bulk endpoint), so a
      // large paper can take a while — report question-level progress, not just
      // section-level, or the label looks frozen.
      let done = 0;
      for (const [i, s] of sections.entries()) {
        setProgress(`Adding section ${i + 1} of ${sections.length}…`);
        const created = await addSection(exam.id, {
          name: s.name.trim(),
          marksCorrect: s.marksCorrect,
          marksWrong: s.marksWrong,
        });
        for (const qid of s.questionIds) {
          done += 1;
          setProgress(
            `Adding questions… ${done} of ${totalQuestions} (${s.name.trim()})`,
          );
          await addQuestionToSection(exam.id, created.id, qid);
        }
      }

      if (isTeacher) {
        // Teacher path: hand the finished paper to the chosen admin. Batches,
        // scheduling and going live are the admin's job after approval.
        setProgress("Submitting for approval…");
        await submitExamForReview(exam.id, reviewerId);
      } else {
        setProgress("Assigning batches…");
        for (const b of batchIds) await assignBatch(exam.id, b);

        setProgress("Scheduling…");
        await scheduleExam(exam.id, {
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
        });

        if (publishNow) {
          setProgress("Publishing…");
          await publishExam(exam.id);
        }
      }

      onCreated?.(exam.id, exam.title);
      reset();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not create the exam. Try again.",
      );
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />

      <div className="relative flex h-full w-full max-w-[720px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Exams / New
            </p>
            <h2 className="mt-1 text-xl font-bold text-admin-ink">
              Create New Exam
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        {/* Stepper */}
        <ol className="flex items-center gap-2 border-b border-admin-line/60 px-8 py-4">
          {STEPS.map((label, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    done
                      ? "bg-admin text-white"
                      : active
                        ? "bg-admin/15 text-admin"
                        : "bg-admin-bg text-admin-muted"
                  }`}
                >
                  {done ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    active ? "text-admin-ink" : "text-admin-muted"
                  }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="mx-1 h-px w-4 bg-admin-line" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex-1 overflow-auto px-8 py-6">
          {refError && (
            <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {refError}
            </p>
          )}

          {/* ---------- Step 1: Basic info ---------- */}
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <Field label="Exam Title" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. NEET Grand Test 06"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Duration (minutes)" required>
                  <input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Max proctoring violations">
                  <input
                    type="number"
                    min={0}
                    value={maxViolations}
                    onChange={(e) => setMaxViolations(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              </div>
              {!isTeacher && (
                <Field label="Program">
                  <select
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— none —</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Instructions">
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Shown to candidates before they start."
                  className={`${inputCls} resize-none`}
                />
              </Field>
              <div className="flex gap-6">
                <Check
                  checked={fullscreenRequired}
                  onChange={setFullscreen}
                  label="Require full screen"
                />
                <Check
                  checked={calculatorEnabled}
                  onChange={setCalculator}
                  label="Allow calculator"
                />
              </div>
            </div>
          )}

          {/* ---------- Step 2: Sections ---------- */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {sections.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_110px_110px_auto] items-end gap-3 rounded-xl border border-admin-line/60 p-4"
                >
                  <Field label="Section name">
                    <input
                      value={s.name}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Correct (+)">
                    <input
                      type="number"
                      value={s.marksCorrect}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((x, idx) =>
                            idx === i
                              ? { ...x, marksCorrect: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Wrong (−)">
                    <input
                      type="number"
                      value={s.marksWrong}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((x, idx) =>
                            idx === i
                              ? { ...x, marksWrong: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </Field>
                  <button
                    onClick={() =>
                      setSections((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    disabled={sections.length === 1}
                    className="mb-1 rounded-lg border border-admin-line px-3 py-2 text-xs font-semibold text-admin-muted hover:bg-admin-bg disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setSections((prev) => [
                    ...prev,
                    {
                      name: "",
                      marksCorrect: 4,
                      marksWrong: 1,
                      questionIds: [],
                    },
                  ])
                }
                className="flex w-fit items-center gap-2 rounded-lg border border-admin-line px-4 py-2 text-sm font-semibold text-admin hover:bg-admin/5"
              >
                <PlusIcon className="size-4" /> Add section
              </button>
            </div>
          )}

          {/* ---------- Step 3: Questions ---------- */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {sections.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveSection(i)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                      i === activeSection
                        ? "bg-admin text-white"
                        : "bg-admin-bg text-admin-muted hover:text-admin-ink"
                    }`}
                  >
                    {s.name || `Section ${i + 1}`} ({s.questionIds.length})
                  </button>
                ))}
              </div>
              <p className="text-sm text-admin-muted">
                Only APPROVED questions from the curated bank can be added.
              </p>
              <QuestionFilterBar
                value={filters}
                onChange={(next) => {
                  // Flag the pending refetch here rather than inside the effect
                  // (setState in an effect body triggers cascading renders).
                  if (Object.values(next).some(Boolean)) setQLoading(true);
                  setFilters(next);
                }}
                facetSource={facetSource}
                resultCount={approved.length}
              />
              <div className="max-h-[320px] overflow-auto rounded-xl border border-admin-line/60">
                {qLoading && (
                  <p className="p-4 text-center text-sm text-admin-muted">
                    Filtering…
                  </p>
                )}
                {approved.map((q) => {
                  const cur = sections[activeSection];
                  const checked = cur?.questionIds.includes(q.id) ?? false;
                  const usedElsewhere = sections.some(
                    (s, idx) =>
                      idx !== activeSection && s.questionIds.includes(q.id),
                  );
                  return (
                    <label
                      key={q.id}
                      className={`flex cursor-pointer items-start gap-3 border-b border-admin-line/40 p-3 last:border-b-0 hover:bg-admin-bg/40 ${
                        usedElsewhere ? "opacity-40" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={usedElsewhere}
                        onChange={() =>
                          setSections((prev) =>
                            prev.map((s, idx) =>
                              idx !== activeSection
                                ? s
                                : {
                                    ...s,
                                    questionIds: checked
                                      ? s.questionIds.filter((x) => x !== q.id)
                                      : [...s.questionIds, q.id],
                                  },
                            ),
                          )
                        }
                        className="mt-1 size-4 accent-admin"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-admin-ink">
                          {q.statement}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Tag>{q.subject}</Tag>
                          <Tag>{q.chapter}</Tag>
                          {q.topic && <Tag>{q.topic}</Tag>}
                          <Tag tone={q.difficulty}>{q.difficulty}</Tag>
                          <Tag>{q.type}</Tag>
                          <Tag>{q.marks} marks</Tag>
                          {q.inPracticeLibrary && (
                            <Tag tone="practice">★ In practice library</Tag>
                          )}
                          {q.examType && <Tag>{q.examType}</Tag>}
                          {(q.tags ?? []).map((t) => (
                            <Tag key={t} tone="tag">
                              #{t}
                            </Tag>
                          ))}
                          {usedElsewhere && (
                            <span className="text-xs text-admin-subtle">
                              already in another section
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {!qLoading && approved.length === 0 && (
                  <p className="p-6 text-center text-sm text-admin-muted">
                    {Object.values(filters).some(Boolean)
                      ? "No approved questions match these filters."
                      : "No approved questions yet. Approve questions in the Question Bank first."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---------- Step 4a (teacher): pick a reviewer ---------- */}
          {step === 3 && isTeacher && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-admin-line/60 bg-admin-bg p-4 text-sm text-admin-muted">
                As a teacher you author the paper and hand it to an admin. After
                they approve it, the admin assigns batches, schedules it and
                starts it.
              </div>
              <Field label="Send to admin for approval" required>
                <select
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select an admin…</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              </Field>
              {admins.length === 0 && (
                <p className="text-sm text-danger">
                  No active admins found to review this exam.
                </p>
              )}
            </div>
          )}

          {/* ---------- Step 4b (admin): Schedule + batches ---------- */}
          {step === 3 && !isTeacher && (
            <div className="flex flex-col gap-5">
              <Field label="Assign batches" required>
                <div className="flex flex-col gap-2 rounded-xl border border-admin-line/60 p-3">
                  {batches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={batchIds.includes(b.id)}
                        onChange={() =>
                          setBatchIds((prev) =>
                            prev.includes(b.id)
                              ? prev.filter((x) => x !== b.id)
                              : [...prev, b.id],
                          )
                        }
                        className="size-4 accent-admin"
                      />
                      {b.name}
                    </label>
                  ))}
                  {batches.length === 0 && (
                    <p className="text-sm text-admin-muted">
                      No batches found.
                    </p>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Opens at" required>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Closes at" required>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
              <Check
                checked={publishNow}
                onChange={setPublishNow}
                label="Publish immediately (students can see it once the window opens)"
              />
            </div>
          )}

          {/* ---------- Step 5: Review ---------- */}
          {step === 4 && (
            <div className="flex flex-col gap-3 text-sm">
              <Row k="Title" v={title} />
              <Row k="Duration" v={`${durationMinutes} minutes`} />
              <Row
                k="Program"
                v={programs.find((p) => p.id === programId)?.name ?? "—"}
              />
              <Row
                k="Sections"
                v={sections
                  .map(
                    (s) =>
                      `${s.name} (${s.questionIds.length} q, +${s.marksCorrect}/−${s.marksWrong})`,
                  )
                  .join(", ")}
              />
              <Row k="Total questions" v={String(totalQuestions)} />
              {isTeacher ? (
                <Row
                  k="Send for approval to"
                  v={admins.find((a) => a.id === reviewerId)?.name ?? "—"}
                />
              ) : (
                <Row
                  k="Batches"
                  v={
                    batches
                      .filter((b) => batchIds.includes(b.id))
                      .map((b) => b.name)
                      .join(", ") || "—"
                  }
                />
              )}
              {!isTeacher && (
                <>
                  <Row
                    k="Window"
                    v={
                      startAt && endAt
                        ? `${new Date(startAt).toLocaleString()} → ${new Date(endAt).toLocaleString()}`
                        : "—"
                    }
                  />
                  <Row
                    k="Publish now"
                    v={publishNow ? "Yes" : "No (stays DRAFT)"}
                  />
                </>
              )}

              {error && (
                <p className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-danger">
                  {error}
                </p>
              )}
              {progress && (
                <p className="mt-2 rounded-lg border border-admin/30 bg-admin/5 px-3 py-2 text-admin">
                  {progress}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-admin-line/60 px-8 py-5">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            disabled={submitting}
            className="rounded-lg border border-admin-line bg-white px-5 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {submitting
                ? (progress ?? "Working…")
                : isTeacher
                  ? "Create & Submit for Approval"
                  : "Create Exam"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin";

/** Compact metadata chip used on the question picker rows. */
function Tag({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const cls =
    tone === "EASY"
      ? "bg-admin-mint/50 text-admin"
      : tone === "MEDIUM"
        ? "bg-warn/15 text-warn"
        : tone === "HARD"
          ? "bg-danger/10 text-danger"
          : tone === "tag"
            ? "bg-admin/5 text-admin-2"
            : "bg-admin-surface text-admin-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
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

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-admin-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-admin"
      />
      {label}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-admin-line/40 pb-2">
      <span className="text-admin-muted">{k}</span>
      <span className="text-right font-semibold text-admin-ink">{v}</span>
    </div>
  );
}
