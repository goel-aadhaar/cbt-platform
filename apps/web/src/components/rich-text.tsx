"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

import { decodeEntities, restoreFormatTags } from "@/lib/rich-text";

/**
 * Question text with maths typeset. Every screen that shows a statement, an
 * option or an explanation renders it through here, so a question looks the same
 * in the editor preview, the bank, review, the exam and the result.
 *
 * The platform had no notation rendering at all: statements were printed as
 * plain text, so `E = 1/2 m v^2`, `H2SO4` and `$\\tfrac{1}{2}mv^2$` all reached
 * the candidate exactly as the author typed them. For a Physics, Chemistry or
 * Maths paper that is the difference between a readable question and a puzzle.
 *
 * Stored text is inline HTML, in the form the server writes it
 * (`sanitizeQuestionText`): `<strong>`, `<em>`, `<u>`, `<sub>`, `<sup>` and line
 * breaks around entity-escaped text. Two notations sit inside it:
 *
 *  - **LaTeX** between `$…$` / `$$…$$` / `\\(…\\)` / `\\[…\\]`, typeset by KaTeX.
 *  - **Formatting tags** for the common school-level cases where LaTeX is
 *    overkill. All of them are on the server's sanitizer allowlist.
 *
 * ## Why this is safe to render as HTML
 *
 * `Question.statement`, its options and its explanation are sanitized **on
 * write**, against the same allowlist as every other rich-text field — no
 * scripts, no event handlers, no styles. This component then does two things,
 * in this order:
 *
 *  1. splits the text on maths delimiters, so LaTeX is never treated as markup;
 *  2. rebuilds the non-maths segments from scratch: allowlisted tags are written
 *     out by name with no attributes, and everything else, including any other
 *     tag, is decoded and then escaped.
 *
 * KaTeX runs with `trust: false` and `throwOnError: false`, so a malformed or
 * hostile expression renders as visible red source rather than executing or
 * blanking the question. Belt and braces: even if something unsanitized reached
 * this component, step 2 would still escape it.
 *
 * Decoding before escaping is what makes `&` display as `&`: the text is stored
 * escaped, so escaping it again here used to put a literal `&amp;` on screen.
 */

const MATH_SPLIT =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

/**
 * Tags the renderer deals with. Attributes have to look like `name=value`, so
 * the less-than sign in `a<b and c>d` stays text.
 */
const TAG_TOKEN =
  /<(\/?)(strong|b|em|i|u|s|sub|sup|code|br|p|ul|ol|li|blockquote|a|pre)(?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))*\s*\/?>/gi;

/** Same formatting, older spelling. */
const TAG_ALIAS: Record<string, string> = { b: "strong", i: "em" };

/** The sanitizer allows these, but no question field shows them; the words stay. */
const DROPPED_TAGS = new Set(["a", "pre"]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Text between tags: decoded once, escaped once, line breaks kept. */
function renderTextRun(s: string): string {
  return escapeHtml(decodeEntities(s)).replace(/\r?\n/g, "<br>");
}

/**
 * Rebuild a non-maths segment. A Word equation that import could not convert
 * (`[[EQ: …]]`) is marked so a reviewer cannot miss that it still has to be
 * retyped as LaTeX.
 */
function renderFormattedText(s: string): string {
  const text = restoreFormatTags(s);
  let html = "";
  let last = 0;
  for (const m of text.matchAll(TAG_TOKEN)) {
    html += renderTextRun(text.slice(last, m.index));
    last = m.index + m[0].length;
    const raw = m[2].toLowerCase();
    const tag = TAG_ALIAS[raw] ?? raw;
    if (DROPPED_TAGS.has(tag)) continue;
    html += tag === "br" ? "<br>" : `<${m[1]}${tag}>`;
  }
  html += renderTextRun(text.slice(last));
  return html.replace(
    /\[\[EQ:[\s\S]*?\]\]/g,
    (m) =>
      `<mark class="rounded bg-warn/30 px-1 font-mono text-xs text-ink">${m}</mark>`,
  );
}

/** Formula source as KaTeX needs it: the text it was stored as, not its markup. */
function mathSource(expr: string): string {
  return decodeEntities(
    expr
      .replace(/<\/?(?:strong|b|em|i|u|s|sub|sup)>/gi, "")
      .replace(/<br\s*\/?>/gi, " "),
  );
}

function renderMath(expr: string, display: boolean): string {
  const source = mathSource(expr);
  try {
    return katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      // Never let a question's text reach `\href`, `\url` or `\includegraphics`.
      trust: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    // Show the author their own source rather than swallowing the question.
    return `<code>${escapeHtml(source)}</code>`;
  }
}

export function toRichHtml(text: string): string {
  return text
    .split(MATH_SPLIT)
    .map((part, i) => {
      if (!part) return "";
      // `split` with a capture group puts every match at an odd index.
      if (i % 2 === 0) return renderFormattedText(part);
      if (part.startsWith("$$") || part.startsWith("\\[")) {
        return renderMath(part.slice(2, -2), true);
      }
      if (part.startsWith("\\(")) return renderMath(part.slice(2, -2), false);
      return renderMath(part.slice(1, -1), false);
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
      // rebuilt here from an allowlist of formatting tags.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
