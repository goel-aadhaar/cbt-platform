/**
 * Exam domain types for the candidate exam screen.
 *
 * The screen is fed entirely from the attempt endpoints; the old local fixture
 * has been removed.
 */

/**
 * A section name, used as the sidebar's tab label.
 *
 * Deliberately a plain string, NOT a Physics/Chemistry/Biology union: sections
 * are free text in the DB, so a single-subject paper (or one with sections like
 * "Section A") must tab correctly rather than collapsing into a fixed triple.
 */
export type Subject = string;

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

/** Format seconds as HH:MM:SS. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
