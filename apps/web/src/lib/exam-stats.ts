/**
 * Shared exam-summary math (§ exam authoring) — used by both the teacher's
 * wizard (Review step) and the admin's review workspace, so the two surfaces
 * can never show different numbers for the same paper.
 *
 * Deliberately decoupled from either caller's own state shape: the wizard
 * holds question ids needing a lookup, `ExamDetail` embeds the question
 * object directly — each caller maps its own data into `StatsInput` first.
 */

export interface StatsQuestion {
  type: "MCQ" | "MSQ" | "INTEGER";
  marks: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

export interface StatsSection {
  name: string;
  marksCorrect: number;
  marksWrong: number;
  questions: StatsQuestion[];
}

export interface ExamStats {
  totalSections: number;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  sections: { name: string; questionCount: number; marks: number }[];
  typeDistribution: Record<StatsQuestion["type"], number>;
  /** Percentage (0-100, rounded) of `totalQuestions` at each difficulty. */
  difficultyDistribution: Record<StatsQuestion["difficulty"], number>;
}

export function computeExamStats(
  sections: StatsSection[],
  durationMinutes = 0,
): ExamStats {
  const allQuestions = sections.flatMap((s) => s.questions);
  const totalQuestions = allQuestions.length;
  const totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);

  const typeDistribution: Record<StatsQuestion["type"], number> = {
    MCQ: 0,
    MSQ: 0,
    INTEGER: 0,
  };
  const difficultyCount: Record<StatsQuestion["difficulty"], number> = {
    EASY: 0,
    MEDIUM: 0,
    HARD: 0,
  };
  for (const q of allQuestions) {
    typeDistribution[q.type] += 1;
    difficultyCount[q.difficulty] += 1;
  }

  const pct = (n: number) =>
    totalQuestions === 0 ? 0 : Math.round((n / totalQuestions) * 100);

  return {
    totalSections: sections.length,
    totalQuestions,
    totalMarks,
    durationMinutes,
    sections: sections.map((s) => ({
      name: s.name,
      questionCount: s.questions.length,
      marks: s.questions.reduce((sum, q) => sum + q.marks, 0),
    })),
    typeDistribution,
    difficultyDistribution: {
      EASY: pct(difficultyCount.EASY),
      MEDIUM: pct(difficultyCount.MEDIUM),
      HARD: pct(difficultyCount.HARD),
    },
  };
}
