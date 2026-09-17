"use client";

import { useEffect, useState } from "react";

import { getDpp, type DppDetail, type DppItem } from "@/lib/dpp";

import { XIcon } from "./icons";
import { QuestionPreviewModal } from "./question-preview-modal";
import { useQuestionPreview } from "./use-question-preview";

/**
 * "What is actually inside this DPP" — the staff-side answer to a student
 * saying question 4 is wrong.
 *
 * The list comes from GET /dpps/:id, which carries only enough of each
 * question to identify it; the full rendering (options, correct answer,
 * explanation, diagrams) is fetched per question on click through the same
 * `useQuestionPreview` machinery the exam builder and review drawer use, so
 * a paper's answer keys are never shipped wholesale just to open a list.
 */
export function DppQuestionsDrawer({
  dpp,
  onClose,
}: {
  dpp: DppItem | null;
  onClose: () => void;
}) {
  /**
   * Both results are tagged with the DPP they belong to and compared at
   * render, rather than being cleared by the effect on the way in — clearing
   * synchronously inside an effect is a cascading render (and what
   * `react-hooks/set-state-in-effect` refuses).
   */
  const [loaded, setLoaded] = useState<{
    forDpp: string;
    detail: DppDetail;
  } | null>(null);
  const [failed, setFailed] = useState<{
    forDpp: string;
    message: string;
  } | null>(null);
  const preview = useQuestionPreview();

  const dppId = dpp?.id ?? null;
  const detail = loaded?.forDpp === dppId ? loaded.detail : null;
  const error = failed?.forDpp === dppId ? failed.message : null;

  useEffect(() => {
    if (!dppId) return;
    let cancelled = false;
    getDpp(dppId)
      .then((d) => {
        if (!cancelled) setLoaded({ forDpp: dppId, detail: d });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFailed({
            forDpp: dppId,
            message:
              e instanceof Error ? e.message : "Could not load this DPP.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dppId]);

  if (!dpp) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex justify-end bg-admin-ink/40"
        onClick={onClose}
      >
        <aside
          className="flex h-full w-full max-w-xl flex-col overflow-auto bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3 border-b border-admin-line/60 px-6 py-4">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-admin-ink">
                {dpp.title}
              </p>
              <p className="mt-0.5 text-xs text-admin-muted">
                {[dpp.subject?.name, dpp.chapter?.name]
                  .filter(Boolean)
                  .join(" · ") || "Unfiled"}{" "}
                · {dpp._count.questions} question
                {dpp._count.questions === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </header>

          <div className="flex flex-col gap-2 px-6 py-5">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {!detail && !error && (
              <p className="py-10 text-center text-sm text-admin-muted">
                Loading questions…
              </p>
            )}
            {detail?.questions.length === 0 && (
              <p className="py-10 text-center text-sm text-admin-muted">
                This DPP has no questions.
              </p>
            )}
            {detail?.questions.map((q, i) => (
              <button
                key={q.question.id}
                type="button"
                onClick={() => preview.openPreview(q.question.id)}
                className="flex flex-col gap-1 rounded-lg border border-admin-line/60 px-4 py-3 text-left hover:border-admin hover:bg-admin/[0.03]"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-admin-muted">
                  Q{i + 1}
                  <span className="rounded bg-admin-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    {q.question.type}
                  </span>
                  <span className="rounded bg-admin-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    {q.question.difficulty}
                  </span>
                </span>
                <span className="line-clamp-3 text-sm text-admin-ink">
                  {q.question.statement}
                </span>
                <span className="text-[11px] text-admin-subtle">
                  {[q.question.subject, q.question.chapter, q.question.topic]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <QuestionPreviewModal
        open={preview.open}
        loading={preview.loading}
        errorMessage={preview.errorMessage}
        detail={preview.detail}
        onClose={preview.closePreview}
      />
    </>
  );
}
