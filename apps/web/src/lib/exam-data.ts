/**
 * Exam domain types + mock data for the candidate exam screen.
 *
 * This mirrors the shape the backend attempt/exam endpoints will return, so the
 * screen can later be fed from the API with minimal change. For now it renders
 * from a local fixture (the Figma reference: NEET 2026, Physics Q14).
 */

export type Subject = "Physics" | "Chemistry" | "Biology";

/** Palette states, matching the design's legend. */
export type QuestionStatus =
  | "not-visited"
  | "not-answered" // visited, left without answering
  | "answered"
  | "marked" // marked for review, no answer
  | "answered-marked"; // answered AND marked for review

export interface ExamQuestion {
  /** Stable question id, e.g. "PHY-77824". */
  id: string;
  subject: Subject;
  /** Question stem (plain text; newlines split into paragraphs). */
  stem: string;
  /** Optional figure shown under the stem. */
  imageUrl?: string;
  options: string[];
  positiveMarks: number;
  negativeMarks: number;
}

export interface ExamMeta {
  candidateName: string;
  candidatePhoto: string;
  examName: string;
  paper: string;
  candidateId: string;
  /** Total duration in seconds (3 hours). */
  durationSeconds: number;
  /** Max proctoring violations before auto-submit. */
  maxViolations: number;
}

export const EXAM_META: ExamMeta = {
  candidateName: "John Smith",
  candidatePhoto: "/exam/candidate-photo.jpg",
  examName: "NEET 2026",
  paper: "Paper 1",
  candidateId: "DRSK-8842",
  durationSeconds: 3 * 60 * 60,
  maxViolations: 3,
};

export const SUBJECTS: Subject[] = ["Physics", "Chemistry", "Biology"];

const SUBJECT_PREFIX: Record<Subject, string> = {
  Physics: "PHY",
  Chemistry: "CHE",
  Biology: "BIO",
};

const GENERIC_STEMS: Record<Subject, string> = {
  Physics:
    "A particle moves along a straight line with constant acceleration. Which of the following statements about its motion is correct?",
  Chemistry:
    "Which of the following compounds exhibits the highest degree of hydrogen bonding in its liquid state?",
  Biology:
    "During which phase of mitosis do the sister chromatids separate and move toward opposite poles of the cell?",
};

const GENERIC_OPTIONS: Record<Subject, string[]> = {
  Physics: ["Option A", "Option B", "Option C", "Option D"],
  Chemistry: ["HF", "HCl", "HBr", "HI"],
  Biology: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
};

/** The featured question from the Figma reference (Physics, Q14). */
const FEATURED_PHYSICS_Q14: ExamQuestion = {
  id: "PHY-77824",
  subject: "Physics",
  stem: "A block of mass m is placed on a smooth inclined plane of inclination θ with the horizontal. The inclined plane is given an acceleration a horizontally towards the right. The value of a so that the block remains stationary with respect to the inclined plane is:",
  imageUrl: "/exam/inclined-plane.jpg",
  options: ["g tanθ", "g sinθ", "g cosθ", "g cotθ"],
  positiveMarks: 4,
  negativeMarks: 1,
};

const QUESTIONS_PER_SUBJECT = 30;

/** Build a fixed set of 30 questions per subject (deterministic ids). */
export function buildExamQuestions(): ExamQuestion[] {
  const all: ExamQuestion[] = [];
  for (const subject of SUBJECTS) {
    for (let i = 1; i <= QUESTIONS_PER_SUBJECT; i++) {
      if (subject === "Physics" && i === 14) {
        all.push(FEATURED_PHYSICS_Q14);
        continue;
      }
      all.push({
        id: `${SUBJECT_PREFIX[subject]}-${77800 + i}`,
        subject,
        stem: GENERIC_STEMS[subject],
        options: [...GENERIC_OPTIONS[subject]],
        positiveMarks: 4,
        negativeMarks: 1,
      });
    }
  }
  return all;
}

/** Format seconds as HH:MM:SS. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
