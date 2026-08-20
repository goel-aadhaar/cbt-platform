import type { QuestionDetail } from "@/lib/questions";

import { XIcon } from "./icons";
import { QuestionPreview } from "./question-preview";

/** Modal chrome around `QuestionPreview`, driven by `useQuestionPreview()`. */
export function QuestionPreviewModal({
  open,
  loading,
  errorMessage,
  detail,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  errorMessage: string | null;
  detail: QuestionDetail | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-admin-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-admin-ink">Question Preview</p>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {errorMessage ? (
          <p className="py-10 text-center text-sm text-danger">
            {errorMessage}
          </p>
        ) : loading || !detail ? (
          <p className="py-10 text-center text-sm text-admin-muted">Loading…</p>
        ) : (
          <QuestionPreview question={detail} />
        )}
      </div>
    </div>
  );
}
