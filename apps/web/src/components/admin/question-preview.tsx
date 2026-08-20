import { AuthedImage } from "@/components/authed-image";
import type { QuestionDetail } from "@/lib/questions";

import { CheckCircleIcon } from "./icons";

/** Which of an INTEGER/MCQ/MSQ answerKey a given option key matches. */
function isCorrectOption(
  answerKey: QuestionDetail["answerKey"],
  optionKey: string,
): boolean {
  if (Array.isArray(answerKey)) return answerKey.includes(optionKey);
  return String(answerKey) === optionKey;
}

/**
 * Read-only rendering of one bank question — statement, diagrams, options
 * with the correct one highlighted (or the numeric answer for INTEGER),
 * explanation. This is "preview exactly as the student will see it" for
 * staff, which is why it deliberately reveals the answer — the interactive
 * exam runner (`app/exam/page.tsx`) is a different component for a different
 * audience and must never do that.
 *
 * Shared by the admin Question Bank's detail drawer and the exam
 * wizard/review workspace's question preview, so all three show the same
 * rendering rather than three hand-rolled copies.
 */
export function QuestionPreview({ question }: { question: QuestionDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          `Sub: ${question.subject}`,
          `Ch: ${question.chapter}`,
          question.topic ? `Topic: ${question.topic}` : null,
          `Type: ${
            question.type === "MCQ"
              ? "Single Choice"
              : question.type === "MSQ"
                ? "Multi-select"
                : "Numeric"
          }`,
          `Diff: ${question.difficulty[0]}${question.difficulty.slice(1).toLowerCase()}`,
          `Marks: +${question.marks} / -${question.negativeMarks}`,
        ]
          .filter((m): m is string => Boolean(m))
          .map((m) => (
            <span
              key={m}
              className="rounded-lg bg-admin-surface px-3 py-1.5 text-sm text-admin-muted"
            >
              {m}
            </span>
          ))}
      </div>

      <section className="rounded-xl border border-admin-line/60 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
          Question Stem
        </p>
        <p className="mt-3 whitespace-pre-wrap text-admin-ink">
          {question.statement}
        </p>
        {question.mediaKeys.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {question.mediaKeys.map((key) => (
              <AuthedImage
                key={key}
                url={`/media/file/${encodeURIComponent(key)}`}
                alt="Question diagram"
                className="max-h-72 max-w-full rounded border border-admin-line bg-white object-contain"
              />
            ))}
          </div>
        )}
      </section>

      {question.type === "INTEGER" ? (
        <section>
          <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
            Correct Answer
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-admin/40 bg-admin-mint/15 p-4">
            <CheckCircleIcon className="size-5 shrink-0 text-admin" />
            <p className="font-semibold text-admin-ink">
              {String(question.answerKey)}
            </p>
          </div>
        </section>
      ) : (
        question.options && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
              Options
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {question.options.map((o) => {
                const correct = isCorrectOption(question.answerKey, o.key);
                return (
                  <div
                    key={o.key}
                    className={`flex items-start gap-3 rounded-xl border p-4 ${
                      correct
                        ? "border-admin/40 bg-admin-mint/15"
                        : "border-admin-line/60"
                    }`}
                  >
                    {correct ? (
                      <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-admin" />
                    ) : (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-admin-surface text-xs font-bold text-admin-muted">
                        {o.key}
                      </span>
                    )}
                    <p className="font-semibold text-admin-ink">{o.text}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )
      )}

      {question.explanation && (
        <section className="rounded-xl border border-admin-line/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
            Explanation
          </p>
          <p className="mt-3 whitespace-pre-wrap text-admin-ink">
            {question.explanation}
          </p>
        </section>
      )}
    </div>
  );
}
