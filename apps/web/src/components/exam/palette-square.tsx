import type { CSSProperties } from "react";

import type { QuestionStatus } from "@/lib/exam-data";

/**
 * The "Not Answered" swatch is a flat-top hexagon (from the Figma vector
 * 9:1651). Reproduced as a clip-path so it needs no image asset.
 */
const NOT_ANSWERED_CLIP =
  "polygon(10.74% 0, 89.26% 0, 100% 47.93%, 89.26% 100%, 10.74% 100%, 0 47.93%)";

const STATUS_CLASSES: Record<QuestionStatus, string> = {
  "not-visited": "bg-fill text-ink border border-subtle rounded-[2px]",
  "not-answered": "bg-not-answered text-white",
  answered: "bg-success text-white rounded-t-[4px]",
  marked: "bg-brand-accent text-white rounded-full",
  "answered-marked": "bg-brand-accent text-white rounded-full",
};

export function statusLabel(status: QuestionStatus): string {
  switch (status) {
    case "not-visited":
      return "Not Visited";
    case "not-answered":
      return "Not Answered";
    case "answered":
      return "Answered";
    case "marked":
      return "Marked for Review";
    case "answered-marked":
      return "Answered & Marked for Review";
  }
}

export function PaletteSquare({
  n,
  status,
  active = false,
  onClick,
  className = "",
}: {
  n: number | string;
  status: QuestionStatus;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const style: CSSProperties =
    status === "not-answered" ? { clipPath: NOT_ANSWERED_CLIP } : {};

  // The active (current) question gets a distinct outlined chip that overrides
  // the status fill, matching the design's "Current Active" state.
  const base = active
    ? "bg-brand-soft text-brand border-2 border-brand rounded-[2px] font-bold"
    : STATUS_CLASSES[status];

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`relative flex aspect-square items-center justify-center text-center text-sm leading-5 ${base} ${
        onClick ? "cursor-pointer transition-transform hover:scale-105" : ""
      } ${className}`}
      style={style}
    >
      {n}
      {status === "answered-marked" && (
        <span className="absolute bottom-0 right-0 size-[10px] rounded-full border border-white bg-success" />
      )}
    </Tag>
  );
}
