/**
 * Work out what changed between the exam as loaded and the exam as edited.
 *
 * Kept as a pure function rather than living inside the wizard's save handler
 * for one reason: the *order* of these operations is load-bearing and easy to
 * get wrong in a way that only shows up on a paper somebody has already built.
 * A function that returns a plan can be tested; a sequence of awaits buried in
 * a component cannot.
 *
 * The rule the ordering exists for: a question moved from one section to
 * another must be removed before it is added. `POST .../questions` refuses a
 * question already on the paper (409, "Question already in this exam"), so
 * add-then-remove fails on the add and then deletes the original — losing the
 * question from the paper entirely.
 */

export interface PlannedSection {
  /** Present when the section already exists on the server. */
  id?: string;
  name: string;
  marksCorrect: number;
  marksWrong: number;
  questionIds: string[];
}

export interface ExamEditPlan {
  /** Sections to delete, by server id. Runs first. */
  removeSections: string[];
  /** Question placements to drop, by section. Runs before any addition. */
  removeQuestions: { sectionId: string; questionId: string }[];
  /** Existing sections whose name or marking scheme changed. */
  updateSections: {
    id: string;
    name: string;
    marksCorrect: number;
    marksWrong: number;
  }[];
  /** Sections that do not exist yet, in the order they should be created. */
  createSections: PlannedSection[];
  /** Questions to add to sections that already exist. */
  addQuestions: { sectionId: string; questionId: string }[];
  batches: { add: string[]; remove: string[] };
  /** True when nothing at all changed — the save can be skipped. */
  empty: boolean;
}

export function planExamEdit(
  before: { sections: Required<PlannedSection>[]; batchIds: string[] },
  after: { sections: PlannedSection[]; batchIds: string[] },
): ExamEditPlan {
  const keptIds = new Set(
    after.sections.map((s) => s.id).filter((id): id is string => Boolean(id)),
  );
  const removeSections = before.sections
    .filter((s) => !keptIds.has(s.id))
    .map((s) => s.id);

  const removeQuestions: ExamEditPlan["removeQuestions"] = [];
  const updateSections: ExamEditPlan["updateSections"] = [];
  const createSections: PlannedSection[] = [];
  const addQuestions: ExamEditPlan["addQuestions"] = [];

  for (const section of after.sections) {
    const was = section.id
      ? before.sections.find((b) => b.id === section.id)
      : undefined;

    if (!section.id || !was) {
      // Brand new: its questions are added when it is created, so they are not
      // listed separately — there is no section id to add them to yet.
      createSections.push(section);
      continue;
    }

    const now = new Set(section.questionIds);
    for (const questionId of was.questionIds) {
      if (!now.has(questionId)) {
        removeQuestions.push({ sectionId: was.id, questionId });
      }
    }

    if (
      was.name !== section.name ||
      was.marksCorrect !== section.marksCorrect ||
      was.marksWrong !== section.marksWrong
    ) {
      updateSections.push({
        id: was.id,
        name: section.name,
        marksCorrect: section.marksCorrect,
        marksWrong: section.marksWrong,
      });
    }

    const already = new Set(was.questionIds);
    for (const questionId of section.questionIds) {
      if (!already.has(questionId)) {
        addQuestions.push({ sectionId: was.id, questionId });
      }
    }
  }

  const wasBatches = new Set(before.batchIds);
  const nowBatches = new Set(after.batchIds);

  const plan: Omit<ExamEditPlan, "empty"> = {
    removeSections,
    removeQuestions,
    updateSections,
    createSections,
    addQuestions,
    batches: {
      add: after.batchIds.filter((b) => !wasBatches.has(b)),
      remove: before.batchIds.filter((b) => !nowBatches.has(b)),
    },
  };

  return {
    ...plan,
    empty:
      plan.removeSections.length === 0 &&
      plan.removeQuestions.length === 0 &&
      plan.updateSections.length === 0 &&
      plan.createSections.length === 0 &&
      plan.addQuestions.length === 0 &&
      plan.batches.add.length === 0 &&
      plan.batches.remove.length === 0,
  };
}
