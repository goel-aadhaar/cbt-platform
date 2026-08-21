"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/**
 * Question text with maths typeset.
 *
 * The platform had no notation rendering at all: statements were printed as
 * plain text, so `E = 1/2 m v^2`, `H2SO4` and `$\\tfrac{1}{2}mv^2$` all reached
 * the candidate exactly as the author typed them. For a Physics, Chemistry or
 * Maths paper that is the difference between a readable question and a puzzle.
 *
 * Two notations are supported, because authors already use both:
 *
 *  - **LaTeX** between `$…$` / `$$…$$` / `\\(…\\)` / `\\[…\\]`, typeset by KaTeX.
 *  - **HTML `<sub>` / `<sup>`**, for the common school-level cases where LaTeX
 *    is overkill. Both tags are on the server's sanitizer allowlist.
 *
 * ## Why this is safe to render as HTML
 *
 * `Question.statement`, its options and its explanation are sanitized **on
 * write** (`sanitizeQuestionText`), against the same allowlist as every other
 * rich-text field — no scripts, no event handlers, no styles. This component
 * then does two things, in this order:
 *
 *  1. splits the text on maths delimiters, so LaTeX is never treated as markup;
 *  2. escapes everything in the non-maths segments **except** the handful of
 *     allowlisted formatting tags.
 *
 * KaTeX runs with `trust: false` and `throwOnError: false`, so a malformed or
 * hostile expression renders as visible red source rather than executing or
 * blanking the question. Belt and braces: even if something unsanitized reached
 * this component, step 2 would still escape it.
 */

const MATH_SPLIT =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape everything, then put the allowlisted formatting tags back. */
function escapeButKeepFormatting(s: string): string {
  return escapeHtml(s).replace(
    /&lt;(\/?)(strong|em|s|sub|sup|code|br|p|ul|ol|li|blockquote)\s*\/?&gt;/gi,
    (_m, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`,
  );
}

function renderMath(expr: string, display: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode: display,
      throwOnError: false,
      // Never let a question's text reach `\href`, `\url` or `\includegraphics`.
      trust: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    // Show the author their own source rather than swallowing the question.
    return `<code>${escapeHtml(expr)}</code>`;
  }
}

export function toRichHtml(text: string): string {
  return text
    .split(MATH_SPLIT)
    .map((part) => {
      if (!part) return "";
      if (part.startsWith("$$") && part.endsWith("$$")) {
        return renderMath(part.slice(2, -2), true);
      }
      if (part.startsWith("\\[") && part.endsWith("\\]")) {
        return renderMath(part.slice(2, -2), true);
      }
      if (part.startsWith("\\(") && part.endsWith("\\)")) {
        return renderMath(part.slice(2, -2), false);
      }
      if (part.length > 1 && part.startsWith("$") && part.endsWith("$")) {
        return renderMath(part.slice(1, -1), false);
      }
      return escapeButKeepFormatting(part);
    })
    .join("");
}

/**
 * Render question text with its notation typeset.
 *
 * `as` defaults to a paragraph; pass `span` for inline contexts such as an
 * option label, where a block element would break the layout.
 */
export function RichText({
  text,
  className,
  as: Tag = "p",
}: {
  text: string;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  const html = useMemo(() => toRichHtml(text ?? ""), [text]);
  return (
    <Tag
      className={className}
      // Safe by construction — see the file comment: sanitized on write, and
      // re-escaped here down to an allowlist of formatting tags.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
