/**
 * Shared pre-flight validation (§ exam authoring) — the "N warnings, review
 * recommended" checklist run before a teacher submits and before an admin
 * approves, so both sides see the same picture of what's actually wrong.
 *
 * Scoped to checks this schema can actually produce. A few items from the
 * original ask don't appear here because they're structurally impossible
 * given how the question bank already works:
 *   - "missing marks/options/answer key" — `Question.marks`/`options`/
 *     `answerKey` are validated at authoring time (`validateContent()` in
 *     `questions.service.ts`); a bank question can't exist without them.
 *   - "difficulty not set" — `Question.difficulty` is a required column.
 *   - "duplicate questions" — `@@unique([examId, questionId])` already makes
 *     this impossible to create, and the UI disables an already-used
 *     question in the picker.
 * "No topic assigned" (topicId is genuinely optional) is the closest honest
 * analog to that missing-classification warning. Broken-media detection and
 * negative-marking/short-section warnings are real and included below.
 */

export interface PreflightQuestion {
  id: string;
  topicId: string | null;
  mediaKeys: string[];
}

export interface PreflightSection {
  name: string;
  marksWrong: number;
  questions: PreflightQuestion[];
}

export interface PreflightCheck {
  message: string;
}

export interface PreflightResult {
  errors: PreflightCheck[];
  warnings: PreflightCheck[];
}

const MIN_QUESTIONS_PER_SECTION_WARNING = 3;

export function runPreflightChecks(
  sections: PreflightSection[],
  durationMinutes: number,
  /** Media keys known to still resolve — omit to skip the broken-media check. */
  knownMediaKeys?: Set<string>,
): PreflightResult {
  const errors: PreflightCheck[] = [];
  const warnings: PreflightCheck[] = [];

  if (sections.length === 0) {
    errors.push({ message: "Add at least one section." });
  }
  const emptySections = sections.filter((s) => s.questions.length === 0);
  for (const s of emptySections) {
    errors.push({
      message: `"${s.name || "Untitled section"}" has no questions.`,
    });
  }

  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
  if (totalQuestions === 0) {
    errors.push({ message: "The exam has no questions." });
  }
  if (durationMinutes <= 0) {
    errors.push({ message: "Duration must be greater than 0 minutes." });
  }

  for (const s of sections) {
    if (
      s.questions.length > 0 &&
      s.questions.length < MIN_QUESTIONS_PER_SECTION_WARNING
    ) {
      warnings.push({
        message: `"${s.name || "Untitled section"}" has only ${s.questions.length} question${s.questions.length === 1 ? "" : "s"}.`,
      });
    }
    if (s.questions.length > 0 && s.marksWrong === 0) {
      warnings.push({
        message: `"${s.name || "Untitled section"}" has no negative marking configured.`,
      });
    }
  }

  const noTopicCount = sections
    .flatMap((s) => s.questions)
    .filter((q) => !q.topicId).length;
  if (noTopicCount > 0) {
    warnings.push({
      message: `${noTopicCount} question${noTopicCount === 1 ? "" : "s"} have no topic assigned.`,
    });
  }

  if (knownMediaKeys) {
    const broken = sections
      .flatMap((s) => s.questions)
      .filter((q) => q.mediaKeys.some((k) => !knownMediaKeys.has(k)));
    if (broken.length > 0) {
      warnings.push({
        message: `${broken.length} question${broken.length === 1 ? "" : "s"} reference an image that's no longer available.`,
      });
    }
  }

  return { errors, warnings };
}
