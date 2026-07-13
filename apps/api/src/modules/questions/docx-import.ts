import mammoth from 'mammoth';

import { ParsedQuestion } from './ports/question-import.port';

const OPTION_RE = /^\(?([A-Ha-h])[).\]]\s+(.+)$/;
const ANSWER_RE = /^(?:answer|ans|correct answer|correct)\s*[:.-]?\s*(.+)$/i;
const META_RE =
  /^(subject|chapter|topic|difficulty|type|marks|negative(?:\s*marks)?|tags|explanation|language|exam\s*type)\s*[:.-]?\s*(.+)$/i;
// A new question starts with "Q:", "Q1.", "Question:", "1.", "1)" etc.
const STATEMENT_RE = /^(?:Q(?:uestion)?\s*\d*\s*[:.)]|\d+\s*[:.)])\s*(.*)$/i;

/** Extract raw text from a .docx buffer (paragraphs become lines). */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Parse a plain-text question paper (§2.4) into question blocks. Each question
 * begins with a `Q:`/`Q1.`/`1.` marker; option lines are `A) …`, the correct
 * choice is `Answer: …`, and any `Key: value` line (Subject, Chapter, Type, …)
 * sets per-question metadata. Lines that match nothing extend the statement.
 */
export function parseQuestions(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;

  const push = () => {
    if (current && current.statement.trim()) questions.push(current);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const statementStart = STATEMENT_RE.exec(line);
    const option = OPTION_RE.exec(line);
    const answer = ANSWER_RE.exec(line);
    const meta = META_RE.exec(line);

    if (statementStart) {
      push();
      current = {
        statement: statementStart[1].trim(),
        options: [],
        answer: null,
        meta: {},
      };
    } else if (!current) {
      // Preamble before the first question marker — ignore.
      continue;
    } else if (option) {
      current.options.push({
        key: option[1].toUpperCase(),
        text: option[2].trim(),
      });
    } else if (answer) {
      current.answer = answer[1].trim();
    } else if (meta) {
      const key = meta[1].toLowerCase().replace(/\s+/g, '');
      current.meta[key] = meta[2].trim();
    } else {
      // Continuation of the statement.
      current.statement = `${current.statement} ${line}`.trim();
    }
  }
  push();
  return questions;
}
