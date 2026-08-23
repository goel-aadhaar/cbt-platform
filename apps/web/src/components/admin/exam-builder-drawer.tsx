"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";

import {
  addQuestionToSection,
  addSection,
  listSubjects,
  removeQuestionFromSection,
  removeSection,
  unassignBatch,
  updateExam,
  updateSection,
  type ExamDetail,
  assignBatch,
  createExam,
  listAdmins,
  listBatches,
  listPrograms,
  publishExam,
  scheduleExam,
  submitExamForReview,
  type BatchRow,
  type Subject,
  type Program,
  type StaffRow,
} from "@/lib/admin";
import { getUserSnapshot } from "@/lib/auth";
import { listExamCategories, type ExamCategory } from "@/lib/exam-categories";
import {
  runPreflightChecks,
  type PreflightSection,
} from "@/lib/exam-preflight";
import { computeExamStats, type StatsSection } from "@/lib/exam-stats";
import {
  listInstructionTemplates,
  type InstructionTemplate,
} from "@/lib/instruction-templates";
import {
  listQuestions,
  type QuestionFilters,
  type QuestionListItem,
} from "@/lib/questions";

import { CheckIcon, EyeIcon, GripVerticalIcon, PlusIcon, XIcon } from "./icons";
import { planExamEdit } from "@/lib/exam-edit-plan";
import { PreFlightPanel } from "./preflight-panel";
import { QuestionFilterBar } from "./question-filters";
import { QuestionPreviewModal } from "./question-preview-modal";
import { isRichTextEmpty, RichTextEditor } from "./rich-text-editor";
import { useQuestionPreview } from "./use-question-preview";

import { useBatchPaths } from "./academic-cascade";

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
  /** Local-only stable id, used as the drag-and-drop identity — the array
   * index shifts on every reorder, so it cannot serve as one. */
  key: string;
  /**
   * The server's id, present only when this section already exists.
   *
   * This is what makes saving an edit different from saving a new exam: a
   * section with an id is amended in place, one without is created, and one
   * that has vanished from this array is deleted.
   */
  id?: string;
  name: string;
  marksCorrect: number;
  marksWrong: number;
  /** Question ids chosen for this section (APPROVED only). */
  questionIds: string[];
}

let draftKeySeq = 0;
/** `crypto.randomUUID()` needs a secure context; a counter works everywhere
 * and only has to be unique within one open wizard session. */
function nextDraftKey(): string {
  draftKeySeq += 1;
  return `draft-${draftKeySeq}`;
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
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (examId: string, title: string) => void;
  /**
   * Provide to edit an existing exam instead of authoring a new one.
   *
   * Until this existed there was no way to change an exam at all once it left
   * the wizard — which made rejecting one a dead end, since the teacher could
   * read the reason and do nothing about it. The parent remounts this via
   * `key`, so the state below seeds once per target rather than resyncing.
   */
  editing?: ExamDetail | null;
}) {
  const [step, setStep] = useState(0);
  /**
   * The furthest step reached, so the stepper can jump back to anything already
   * visited. Editing an existing paper starts fully unlocked: every step is
   * backed by saved data, so making someone walk forward through all five to
   * change one question was busywork — and with a required field unset on step
   * one, it was a dead end rather than merely tedious.
   */
  const [maxReached, setMaxReached] = useState(() =>
    editing ? ADMIN_STEPS.length - 1 : 0,
  );

  // Step 1
  const [title, setTitle] = useState(editing?.title ?? "");
  const [durationMinutes, setDuration] = useState(
    editing?.durationMinutes ?? 180,
  );
  const [passingMarks, setPassingMarks] = useState(
    editing?.passingMarks != null ? String(editing.passingMarks) : "",
  );
  const [maxViolations, setMaxViolations] = useState(3);
  const [programId, setProgramId] = useState(editing?.programId ?? "");
  const [categoryId, setCategoryId] = useState(editing?.category?.id ?? "");
  const [categories, setCategories] = useState<ExamCategory[]>([]);
  const [templates, setTemplates] = useState<InstructionTemplate[]>([]);
  const [instructions, setInstructions] = useState(editing?.instructions ?? "");
  const [calculatorEnabled, setCalculator] = useState(false);
  const [fullscreenRequired, setFullscreen] = useState(true);

  // Step 2/3
  /**
   * Existing sections keep their server id, so saving can tell an amendment
   * from an addition. A section authored here has no id until it is created.
   */
  const [sections, setSections] = useState<DraftSection[]>(
    editing?.sections.length
      ? [...editing.sections]
          .sort((a, b) => a.order - b.order)
          .map((sec) => ({
            key: nextDraftKey(),
            id: sec.id,
            name: sec.name,
            marksCorrect: sec.marksCorrect,
            marksWrong: sec.marksWrong,
            questionIds: [...sec.questions]
              .sort((a, b) => a.order - b.order)
              .map((q) => q.question.id),
          }))
      : [
          {
            key: nextDraftKey(),
            name: "",
            marksCorrect: 4,
            marksWrong: 1,
            questionIds: [],
          },
        ],
  );
  /** The paper as it was loaded, to diff against on save. */
  const [original] = useState(() =>
    editing
      ? {
          sections: editing.sections.map((sec) => ({
            id: sec.id,
            name: sec.name,
            marksCorrect: sec.marksCorrect,
            marksWrong: sec.marksWrong,
            questionIds: [...sec.questions]
              .sort((a, b) => a.order - b.order)
              .map((q) => q.question.id),
          })),
          batchIds: editing.batches.map((b) => b.batch.id),
        }
      : null,
  );
  const [activeSection, setActiveSection] = useState(0);

  // Step 4
  const [batchIds, setBatchIds] = useState<string[]>(
    editing?.batches.map((b) => b.batch.id) ?? [],
  );
  /**
   * Section names come from the subject taxonomy rather than free text.
   *
   * A section *is* a subject on an NTA-style paper, and typing the name by hand
   * produced "Physics", "physics" and "Phy" across three exams — which reads
   * fine on the page and makes every cross-exam report treat them as different
   * things. This is the same list the question bank is tagged against, so a
   * section and the questions inside it can no longer disagree.
   */
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const { path: batchPath } = useBatchPaths(open);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [publishNow, setPublishNow] = useState(true);

  // Reference data
  // Teachers can author and submit, but cannot assign batches / schedule /
  // publish (those routes are ADMIN-only), so their flow ends at submission.
  const isTeacher = getUserSnapshot()?.role === "TEACHER";
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
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
  // Every question ever loaded into `approved` this session, keyed by id —
  // `approved` itself is replaced wholesale on each filter change, so a
  // question picked under a filter the user has since moved away from would
  // otherwise vanish from the "selected for this section" list and the
  // stats/pre-flight math. Merged in alongside `setApproved` below, not via
  // a separate effect, to keep every update inside an already-async (`.then`)
  // callback rather than the effect body itself.
  const [questionCache, setQuestionCache] = useState<
    Map<string, QuestionListItem>
  >(new Map());

  const preview = useQuestionPreview();

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
      // Only categories still on offer — a retired one would be refused.
      listExamCategories(true),
      listInstructionTemplates(true),
      listSubjects(),
    ]).then(([p, b, q, a, c, t, subj]) => {
      if (cancelled) return;
      if (p.status === "fulfilled") setPrograms(p.value);
      if (b.status === "fulfilled") setBatches(b.value);
      if (a.status === "fulfilled") setAdmins(a.value);
      if (c.status === "fulfilled") setCategories(c.value.items);
      if (t.status === "fulfilled") setTemplates(t.value.items);
      if (subj.status === "fulfilled") setSubjects(subj.value);
      if (q.status === "fulfilled") {
        setApproved(q.value.items);
        setFacetSource(q.value.items);
        setQuestionCache(
          (prev) =>
            new Map([...prev, ...q.value.items.map((x) => [x.id, x] as const)]),
        );
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
          setQuestionCache(
            (prev) =>
              new Map([...prev, ...r.items.map((x) => [x.id, x] as const)]),
          );
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

  const activeSectionQuestions: QuestionListItem[] = useMemo(
    () =>
      (sections[activeSection]?.questionIds ?? [])
        .map((id) => questionCache.get(id))
        .filter((q): q is QuestionListItem => Boolean(q)),
    [sections, activeSection, questionCache],
  );

  const statsSections: StatsSection[] = useMemo(
    () =>
      sections.map((s) => ({
        name: s.name,
        marksCorrect: s.marksCorrect,
        marksWrong: s.marksWrong,
        questions: s.questionIds
          .map((id) => questionCache.get(id))
          .filter((q): q is QuestionListItem => Boolean(q))
          .map((q) => ({
            type: q.type,
            marks: q.marks,
            difficulty: q.difficulty,
          })),
      })),
    [sections, questionCache],
  );
  const preflightSections: PreflightSection[] = useMemo(
    () =>
      sections.map((s) => ({
        name: s.name,
        marksWrong: s.marksWrong,
        questions: s.questionIds
          .map((id) => questionCache.get(id))
          .filter((q): q is QuestionListItem => Boolean(q))
          .map((q) => ({ id: q.id, topicId: q.topicId, mediaKeys: [] })),
      })),
    [sections, questionCache],
  );
  const stats = useMemo(
    () => computeExamStats(statsSections, durationMinutes),
    [statsSections, durationMinutes],
  );
  const preflight = useMemo(
    () => runPreflightChecks(preflightSections, durationMinutes),
    [preflightSections, durationMinutes],
  );

  // A small activation distance stops an ordinary click (on the marks inputs,
  // the Remove button, etc.) from being swallowed as a drag.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleSectionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const from = prev.findIndex((s) => s.key === active.id);
      const to = prev.findIndex((s) => s.key === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function handleQuestionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSections((prev) =>
      prev.map((s, idx) => {
        if (idx !== activeSection) return s;
        const from = s.questionIds.indexOf(String(active.id));
        const to = s.questionIds.indexOf(String(over.id));
        if (from === -1 || to === -1) return s;
        return { ...s, questionIds: arrayMove(s.questionIds, from, to) };
      }),
    );
  }

  /**
   * Why Next is unavailable, in the words of the thing that is missing.
   *
   * A greyed button with no explanation is indistinguishable from a broken one
   * — the report that prompted this was "I can't navigate between sections",
   * which was really "nothing tells me the category is required".
   */
  const blockedReason = (() => {
    if (step === 0) {
      if (title.trim().length < 2) return "Give the paper a working title.";
      if (!(durationMinutes > 0)) return "Set a duration in minutes.";
      // A category is what names the paper on approval, so a paper without one
      // would reach candidates under its working title.
      if (categoryId === "") return "Choose an exam category.";
      return null;
    }
    if (step === 1) {
      if (sections.length === 0) return "Add at least one section.";
      if (!sections.every((x) => x.name.trim()))
        return "Every section needs a name.";
      return null;
    }
    if (step === 2)
      return totalQuestions > 0 ? null : "Add at least one question.";
    if (step === 3) {
      if (isTeacher)
        return reviewerId !== "" ? null : "Choose who should approve this.";
      if (batchIds.length === 0) return "Pick at least one batch.";
      if (!startAt || !endAt) return "Set the exam window.";
      return null;
    }
    return null;
  })();
  const canAdvance = blockedReason === null;

  /**
   * Only a paper that is still the author's to send. Anything already with a
   * reviewer, approved, or live belongs to someone else now, and offering a
   * button that the API would reject is worse than offering none.
   */
  const canSubmitForApproval =
    editing?.status === "DRAFT" || editing?.status === "REJECTED";

  const STEPS = isTeacher ? TEACHER_STEPS : ADMIN_STEPS;

  function reset() {
    setStep(0);
    setTitle("");
    setDuration(180);
    setPassingMarks("");
    setMaxViolations(3);
    setProgramId("");
    setCategoryId("");
    setInstructions("");
    setSections([
      {
        key: nextDraftKey(),
        name: "Physics",
        marksCorrect: 4,
        marksWrong: 1,
        questionIds: [],
      },
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
  /**
   * Apply an edit as a diff rather than a rebuild.
   *
   * The obvious implementation — delete every section and re-add them — would
   * be far shorter and would throw away each question's placement history, and
   * briefly leave the paper with no sections at all. So each part is compared
   * with how it was loaded and only what actually changed is sent.
   *
   * Order matters. Removals run before additions so a question moved between
   * sections is not momentarily in both, which the API rejects as a duplicate.
   */
  async function saveEdit(examId: string) {
    const before = original;
    if (!before) return;

    setProgress("Saving details…");
    await updateExam(examId, {
      title: title.trim(),
      durationMinutes,
      passingMarks: passingMarks.trim() ? Number(passingMarks) : null,
      instructions: isRichTextEmpty(instructions) ? "" : instructions,
      programId: programId || null,
      categoryId: categoryId || null,
      maxViolations,
      calculatorEnabled,
      fullscreenRequired,
    });

    const plan = planExamEdit(before, {
      sections: sections.map((sec) => ({
        id: sec.id,
        name: sec.name.trim(),
        marksCorrect: sec.marksCorrect,
        marksWrong: sec.marksWrong,
        questionIds: sec.questionIds,
      })),
      batchIds,
    });

    // The order below is the plan's contract, not an implementation detail —
    // see lib/exam-edit-plan.ts for why removals must precede additions.
    for (const sectionId of plan.removeSections) {
      setProgress("Removing a section…");
      await removeSection(examId, sectionId);
    }
    for (const { sectionId, questionId } of plan.removeQuestions) {
      setProgress("Removing a question…");
      await removeQuestionFromSection(examId, sectionId, questionId);
    }
    for (const section of plan.updateSections) {
      setProgress(`Updating "${section.name}"…`);
      await updateSection(examId, section.id, {
        name: section.name,
        marksCorrect: section.marksCorrect,
        marksWrong: section.marksWrong,
      });
    }
    for (const section of plan.createSections) {
      setProgress(`Adding "${section.name}"…`);
      const made = await addSection(examId, {
        name: section.name,
        marksCorrect: section.marksCorrect,
        marksWrong: section.marksWrong,
      });
      for (const questionId of section.questionIds) {
        await addQuestionToSection(examId, made.id, questionId);
      }
    }
    for (const { sectionId, questionId } of plan.addQuestions) {
      setProgress("Adding a question…");
      await addQuestionToSection(examId, sectionId, questionId);
    }

    if (!isTeacher) {
      for (const b of plan.batches.remove) await unassignBatch(examId, b);
      for (const b of plan.batches.add) await assignBatch(examId, b);
      if (startAt && endAt) {
        setProgress("Scheduling…");
        await scheduleExam(examId, {
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
        });
      }
    }
  }

  /**
   * @param andSubmit send the paper for approval after saving.
   *
   * Saving and submitting stay separate on purpose — a teacher part-way through
   * fixing a sent-back paper must be able to save without bouncing it back to
   * the reviewer. But "save only" was the ONLY option when editing, which left
   * a fresh draft with nowhere to go: it could be edited forever and never
   * sent. This is the second, deliberate action.
   */
  async function submit(andSubmit = false) {
    setSubmitting(true);
    setError(null);
    // The API has no bulk-create endpoint, so this is many sequential calls
    // with no server-side rollback. If one after createExam() fails, a DRAFT
    // already exists — tracked here so the error can say so by name instead
    // of leaving an orphaned draft with no explanation.
    let created: { id: string; title: string } | null = null;
    try {
      if (editing) {
        await saveEdit(editing.id);
        if (andSubmit) {
          setProgress("Sending for approval…");
          await submitExamForReview(editing.id, reviewerId);
        }
        onCreated?.(editing.id, title.trim());
        setSubmitting(false);
        setProgress(null);
        onClose();
        return;
      }

      setProgress("Creating exam…");
      const exam = await createExam({
        title: title.trim(),
        durationMinutes,
        maxViolations,
        calculatorEnabled,
        fullscreenRequired,
        ...(isRichTextEmpty(instructions) ? {} : { instructions }),
        ...(programId ? { programId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(passingMarks.trim() ? { passingMarks: Number(passingMarks) } : {}),
      });
      created = { id: exam.id, title: exam.title };

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

      onCreated?.(created.id, created.title);
      reset();
      onClose();
    } catch (e) {
      const reason =
        e instanceof Error ? e.message : "Could not create the exam.";
      // A step after createExam() failed: the draft exists, so say so by name
      // rather than leaving it to be found by accident in the exam list.
      setError(
        created
          ? `${reason} A draft titled "${created.title}" was already ` +
              `created before this step failed — find it in the exam list to ` +
              `finish setting it up, or discard it.`
          : reason,
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

      {/* Fills the viewport except the 280px sidebar, so the nav stays reachable
          while a long paper is being assembled. Falls back to full width on
          narrow screens, where the sidebar is not beside it anyway. */}
      <div className="relative flex h-full w-full flex-col bg-white shadow-2xl lg:w-[calc(100vw-280px)]">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              {editing ? "Exams / Edit" : "Exams / New"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-admin-ink">
              {editing ? `Edit ${editing.title}` : "Create New Exam"}
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
            // Anything already reached can be jumped to. Steps ahead stay
            // locked, so the forward guards still hold.
            const reachable = i <= maxReached;
            return (
              <li key={label} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => reachable && setStep(i)}
                  disabled={!reachable}
                  aria-current={active ? "step" : undefined}
                  title={
                    reachable
                      ? `Go to ${label}`
                      : "Finish the current step first"
                  }
                  className={`flex items-center gap-2 rounded-lg px-1 py-0.5 ${
                    reachable
                      ? "cursor-pointer hover:bg-admin-bg"
                      : "cursor-not-allowed"
                  }`}
                >
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
                </button>
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
              <Field label="Exam Category" required>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— select a category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.examCount} so far)
                    </option>
                  ))}
                </select>
                {categories.length === 0 ? (
                  <p className="mt-1 text-xs text-admin-muted">
                    No categories yet — an administrator creates these before
                    papers can be authored.
                  </p>
                ) : (
                  selectedCategory && (
                    // The name candidates will see, so the author knows the
                    // working title below is not what gets published.
                    <p className="mt-1 text-xs text-admin-muted">
                      On approval this paper becomes{" "}
                      <span className="font-bold text-admin">
                        {selectedCategory.nextName}
                      </span>
                      .
                    </p>
                  )
                )}
              </Field>
              <Field label="Working title" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Optics + Thermodynamics, week 6"
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-admin-muted">
                  For your own reference while the paper is in review.
                </p>
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
              <Field label="Passing marks (optional)">
                <input
                  type="number"
                  min={0}
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(e.target.value)}
                  placeholder="e.g. 40 — leave blank for no pass/fail line"
                  className={`${inputCls} max-w-xs`}
                />
              </Field>
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
                {templates.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const t = templates.find((x) => x.id === e.target.value);
                      if (t) setInstructions(t.content);
                    }}
                    className={`${inputCls} mb-2`}
                  >
                    <option value="">Use a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <RichTextEditor
                  value={instructions}
                  onChange={setInstructions}
                  placeholder="Shown to candidates before they start."
                />
                {templates.length > 0 && (
                  <p className="mt-1 text-xs text-admin-muted">
                    Picking a template copies its text in — edit freely
                    afterwards, it won&apos;t stay linked to the template.
                  </p>
                )}
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
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext
                  items={sections.map((s) => s.key)}
                  strategy={verticalListSortingStrategy}
                >
                  {sections.map((s, i) => (
                    <SortableSectionRow
                      key={s.key}
                      id={s.key}
                      section={s}
                      subjects={subjects}
                      removeDisabled={sections.length === 1}
                      onChange={(patch) =>
                        setSections((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, ...patch } : x,
                          ),
                        )
                      }
                      onRemove={() =>
                        setSections((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <button
                onClick={() =>
                  setSections((prev) => [
                    ...prev,
                    {
                      key: nextDraftKey(),
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

              <div className="rounded-xl border border-admin-line/60">
                <p className="border-b border-admin-line/60 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-admin-muted">
                  Selected for this section — drag to reorder
                </p>
                {activeSectionQuestions.length === 0 ? (
                  <p className="p-4 text-sm text-admin-muted">
                    No questions selected yet — pick some from the bank below.
                  </p>
                ) : (
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleQuestionDragEnd}
                  >
                    <SortableContext
                      items={activeSectionQuestions.map((q) => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="flex flex-col divide-y divide-admin-line/40">
                        {activeSectionQuestions.map((q) => (
                          <SortableQuestionRow
                            key={q.id}
                            id={q.id}
                            question={q}
                            onPreview={() => preview.openPreview(q.id)}
                            onRemove={() =>
                              setSections((prev) =>
                                prev.map((s, idx) =>
                                  idx !== activeSection
                                    ? s
                                    : {
                                        ...s,
                                        questionIds: s.questionIds.filter(
                                          (x) => x !== q.id,
                                        ),
                                      },
                                ),
                              )
                            }
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
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
                    <div
                      key={q.id}
                      className={`flex items-start gap-3 border-b border-admin-line/40 p-3 last:border-b-0 hover:bg-admin-bg/40 ${
                        usedElsewhere ? "opacity-40" : ""
                      }`}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
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
                                        ? s.questionIds.filter(
                                            (x) => x !== q.id,
                                          )
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
                            {q.examCategory && <Tag>{q.examCategory.name}</Tag>}
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
                      <button
                        type="button"
                        onClick={() => preview.openPreview(q.id)}
                        aria-label="Preview question"
                        className="mt-1 shrink-0 rounded p-1.5 text-admin-muted hover:bg-admin-bg hover:text-admin"
                      >
                        <EyeIcon className="size-4" />
                      </button>
                    </div>
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
                      {batchPath(b)}
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

              <PreFlightPanel stats={stats} preflight={preflight} />

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
            <span className="flex items-center gap-3">
              {blockedReason && (
                <span className="text-xs font-semibold text-admin-muted">
                  {blockedReason}
                </span>
              )}
              <button
                onClick={() =>
                  setStep((prev) => {
                    const next = prev + 1;
                    setMaxReached((m) => Math.max(m, next));
                    return next;
                  })
                }
                disabled={!canAdvance}
                title={blockedReason ?? undefined}
                className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
              >
                Next
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-3">
              {editing && isTeacher && canSubmitForApproval && (
                <button
                  onClick={() => void submit(true)}
                  disabled={
                    submitting ||
                    preflight.errors.length > 0 ||
                    reviewerId === ""
                  }
                  title={
                    reviewerId === ""
                      ? "Choose a reviewer on the Approval step first"
                      : "Save the changes and send this paper to the reviewer"
                  }
                  className="rounded-lg border border-admin bg-white px-5 py-2.5 text-sm font-semibold text-admin hover:bg-admin/5 disabled:opacity-50"
                >
                  {submitting ? "Working…" : "Save & send for approval"}
                </button>
              )}
              <button
                onClick={() => void submit(false)}
                disabled={submitting || preflight.errors.length > 0}
                title={
                  preflight.errors.length > 0
                    ? "Fix the pre-flight errors above before continuing"
                    : undefined
                }
                className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {submitting
                  ? (progress ?? "Working…")
                  : editing
                    ? // Editing never re-submits on its own: a teacher fixing a
                      // sent-back paper saves first and resubmits deliberately
                      // from the list, so a stray save cannot bounce an
                      // unfinished exam back to the reviewer.
                      "Save changes"
                    : isTeacher
                      ? "Create & Submit for Approval"
                      : "Create Exam"}
              </button>
            </span>
          )}
        </footer>
      </div>

      <QuestionPreviewModal
        open={preview.open}
        loading={preview.loading}
        errorMessage={preview.errorMessage}
        detail={preview.detail}
        onClose={preview.closePreview}
      />
    </div>
  );
}

/** One draggable row in the Sections step — its own component because
 * `useSortable` is a hook and can't be called from inside `.map()`. */
function SortableSectionRow({
  id,
  section,
  subjects,
  removeDisabled,
  onChange,
  onRemove,
}: {
  id: string;
  section: DraftSection;
  subjects: Subject[];
  removeDisabled: boolean;
  onChange: (patch: Partial<DraftSection>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_110px_110px_auto] items-end gap-3 rounded-xl border border-admin-line/60 bg-white p-4"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder section"
        className="mb-1 cursor-grab self-end rounded p-2 text-admin-muted hover:bg-admin-bg active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <Field label="Section">
        <select
          value={section.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={inputCls}
        >
          <option value="">
            {subjects.length === 0
              ? "No subjects in the taxonomy yet"
              : "Select a subject"}
          </option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.name}>
              {subject.name}
            </option>
          ))}
          {/*
            A section already named something outside the taxonomy — an older
            exam, or a subject since renamed — keeps its value instead of being
            silently blanked into "Select a subject" the moment it is opened.
          */}
          {section.name &&
            !subjects.some((subject) => subject.name === section.name) && (
              <option value={section.name}>
                {section.name} (not in taxonomy)
              </option>
            )}
        </select>
      </Field>
      <Field label="Correct (+)">
        <input
          type="number"
          value={section.marksCorrect}
          onChange={(e) => onChange({ marksCorrect: Number(e.target.value) })}
          className={inputCls}
        />
      </Field>
      <Field label="Wrong (−)">
        <input
          type="number"
          value={section.marksWrong}
          onChange={(e) => onChange({ marksWrong: Number(e.target.value) })}
          className={inputCls}
        />
      </Field>
      <button
        onClick={onRemove}
        disabled={removeDisabled}
        className="mb-1 rounded-lg border border-admin-line px-3 py-2 text-xs font-semibold text-admin-muted hover:bg-admin-bg disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

/** One draggable row in the Questions step's "selected for this section" list. */
function SortableQuestionRow({
  id,
  question,
  onRemove,
  onPreview,
}: {
  id: string;
  question: QuestionListItem;
  onRemove: () => void;
  onPreview: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 bg-white p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder question"
        className="mt-0.5 cursor-grab rounded p-1 text-admin-muted hover:bg-admin-bg active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-admin-ink">
          {question.statement}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Tag tone={question.difficulty}>{question.difficulty}</Tag>
          <Tag>{question.type}</Tag>
          <Tag>{question.marks} marks</Tag>
        </span>
      </span>
      <button
        type="button"
        onClick={onPreview}
        aria-label="Preview question"
        className="shrink-0 rounded p-1.5 text-admin-muted hover:bg-admin-bg hover:text-admin"
      >
        <EyeIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove question"
        className="shrink-0 rounded p-1.5 text-admin-muted hover:bg-admin-bg hover:text-danger"
      >
        <XIcon className="size-4" />
      </button>
    </li>
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
