import { useEffect, useState } from "react";

import { getQuestion, type QuestionDetail } from "@/lib/questions";

/**
 * Shared "click a question to preview it exactly as the student will see it"
 * state machine — used by both the exam wizard's question picker and the
 * admin review workspace, so staff get the same fetch-on-demand behavior
 * (and the same error/loading treatment) in both places.
 */
export function useQuestionPreview() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (!previewId) return;
    let cancelled = false;
    getQuestion(previewId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled)
          setError({
            id: previewId,
            message:
              e instanceof Error ? e.message : "Could not load the question.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  const errorMessage = error?.id === previewId ? error.message : null;
  const loading =
    previewId !== null && detail?.id !== previewId && !errorMessage;

  return {
    open: previewId !== null,
    openPreview: setPreviewId,
    closePreview: () => setPreviewId(null),
    detail: detail?.id === previewId ? detail : null,
    loading,
    errorMessage,
  };
}
