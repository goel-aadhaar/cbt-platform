"use client";

import { EnlargeableImage, optionImageUrl } from "@/components/option-image";
import { LightbulbIcon } from "@/components/student/icons";
import type {
  PracticeAnswer,
  PracticeCheckResult,
  PracticeQuestion,
} from "@/lib/practice";

/**
 * One answer option, shared by every place a student answers a practice
 * question (originally the ad-hoc Practice Library runner; now the DPP
 * attempt runner). Extracted so the two never drift into two different
 * MCQ/MSQ answering experiences.
 */
export function OptionRow({
  option,
  type,
  picked,
  result,
  disabled,
  onPick,
}: {
  option: {
    key: string;
    text: string;
    mediaKey?: string;
    mediaUrl?: string;
  };
  type: PracticeQuestion["type"];
  picked: PracticeAnswer | null;
  result: PracticeCheckResult | null;
  disabled: boolean;
  onPick: (a: PracticeAnswer) => void;
}) {
  const selected =
    type === "MSQ"
      ? Array.isArray(picked) && picked.includes(option.key)
      : picked === option.key;

  const key = result?.correctAnswer;
  const isCorrectOption =
    result !== null &&
    (Array.isArray(key)
      ? key.includes(option.key)
      : String(key) === option.key);
  const isWrongPick = result !== null && selected && !isCorrectOption;

  function toggle() {
    if (disabled) return;
    if (type === "MSQ") {
      const cur = Array.isArray(picked) ? picked : [];
      onPick(
        cur.includes(option.key)
          ? cur.filter((k) => k !== option.key)
          : [...cur, option.key].sort(),
      );
    } else {
      onPick(option.key);
    }
  }

  let tone = "border-admin-line/60 bg-white";
  if (result !== null && isCorrectOption)
    tone = "border-emerald-600 bg-emerald-50";
  else if (isWrongPick) tone = "border-red-500 bg-red-50";
  else if (selected) tone = "border-admin bg-admin/5";

  const imageUrl = optionImageUrl(option);
  const hasText = option.text.trim() !== "";

  return (
    <div
      className={`relative w-full rounded-xl border-2 text-left transition-colors ${tone} ${
        disabled ? "" : "hover:border-admin"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={hasText ? undefined : `Option ${option.key}`}
        className={`flex w-full items-center gap-3 p-4 text-left disabled:cursor-default ${
          imageUrl ? "pb-2" : ""
        }`}
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            result !== null && isCorrectOption
              ? "bg-emerald-600 text-white"
              : isWrongPick
                ? "bg-red-500 text-white"
                : selected
                  ? "bg-admin text-white"
                  : "bg-admin-line/30 text-admin-muted"
          }`}
        >
          {option.key}
        </span>
        <span className="min-w-0 flex-1 text-sm text-admin-ink">
          {option.text}
        </span>
        {result !== null && isCorrectOption && (
          <span className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            Correct
          </span>
        )}
        {isWrongPick && (
          <span className="shrink-0 rounded bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            Your answer
          </span>
        )}
      </button>
      {imageUrl && (
        <div
          className={`pb-4 pl-[56px] pr-4 ${disabled ? "" : "cursor-pointer"}`}
          onClick={toggle}
        >
          <EnlargeableImage
            url={imageUrl}
            alt={`Option ${option.key} image`}
            caption={`Option ${option.key}`}
            enlargeLabel={`Enlarge image for option ${option.key}`}
            imageClassName="max-h-56 max-w-full rounded border border-admin-line bg-white object-contain sm:max-h-64 lg:max-h-60"
            placeholderClassName="h-40 w-64 max-w-full rounded border border-admin-line"
          />
        </div>
      )}
    </div>
  );
}

export function IntegerInput({
  value,
  onChange,
  disabled,
  result,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  result: PracticeCheckResult | null;
}) {
  return (
    <div>
      <label
        htmlFor="practice-integer"
        className="mb-1.5 block text-sm font-semibold text-admin-ink"
      >
        Your answer
      </label>
      <input
        id="practice-integer"
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border-2 px-4 py-3 text-base text-admin-ink outline-none ${
          result === null
            ? "border-admin-line/60 focus:border-admin"
            : result.correct
              ? "border-emerald-600 bg-emerald-50"
              : "border-red-500 bg-red-50"
        }`}
        placeholder="Type a number"
      />
      {result !== null && !result.correct && (
        <p className="mt-2 text-sm font-semibold text-emerald-700">
          Correct answer: {String(result.correctAnswer)}
        </p>
      )}
    </div>
  );
}

export function Explanation({
  result,
}: {
  result: PracticeCheckResult | null;
}) {
  return (
    <aside className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <h2 className="flex items-center gap-2 text-base font-bold text-admin-ink">
        <LightbulbIcon className="size-5 text-admin" />
        Detailed Explanation
      </h2>
      {result === null ? (
        <p className="mt-3 text-sm text-admin-muted">
          Commit an answer to reveal the worked explanation. Keys are held back
          until then — these questions also appear in live exams.
        </p>
      ) : (
        <>
          <p className="mt-3 rounded-lg bg-admin/6 px-3 py-2 text-sm font-semibold text-admin">
            Correct answer:{" "}
            {Array.isArray(result.correctAnswer)
              ? result.correctAnswer.join(", ")
              : String(result.correctAnswer)}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-admin-ink">
            {result.explanation ??
              "No explanation was provided for this question."}
          </p>
        </>
      )}
    </aside>
  );
}
