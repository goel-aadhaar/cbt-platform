import { normalizeSymbols, symbolFontChar } from "@drsk/shared";

/**
 * Pure helpers for HTML authored by `RichTextEditor` (§2.3), kept free of any
 * Tiptap import so a caller that only needs the empty-check does not pull the
 * editor's six-package dependency into its bundle just to import one function
 * from the same file (§ bundle-splitting fix — see `rich-text-editor.tsx`).
 */

/**
 * An untouched Tiptap editor still emits `<p></p>` from `getHTML()` — a plain
 * `.trim()` on that string is never empty. Callers deciding whether to send
 * `instructions` at all should check this instead of truthiness on the HTML.
 */
export function isRichTextEmpty(html: string): boolean {
  return !html.replace(/<[^>]*>/g, "").trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Undo entity encoding, however many times it was applied. */
export function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(
      /&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d+)|#x([0-9a-f]+));/gi,
      (entity, name?: string, dec?: string, hex?: string) => {
        if (name) return NAMED_ENTITIES[name.toLowerCase()];
        const code = dec ? Number(dec) : parseInt(hex ?? "", 16);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      },
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Question text with its markup gone, for the places HTML cannot go: a
 * `<select>` option, a `title` attribute, a length cut.
 */
export function questionPlainText(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>|<\/(?:p|li|div)>/gi, " ").replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Question text with nothing in it: `.trim()` is not enough, because the
 * editor's `<br>` and a lone `&nbsp;` both have length but no content.
 */
export function isQuestionTextEmpty(html: string): boolean {
  return !questionPlainText(html);
}

/**
 * A formatting tag sitting in the text as visible characters, escaped once or
 * more: `CO&lt;sub&gt;2&lt;/sub&gt;`. Authors meant formatting, so every reader
 * of question text restores it instead of showing the tag.
 */
const ESCAPED_FORMAT_TAG =
  /&(?:amp;)*lt;(\/?)(sub|sup|strong|b|em|i|u)&(?:amp;)*gt;/gi;

export function restoreFormatTags(html: string): string {
  return html.replace(ESCAPED_FORMAT_TAG, "<$1$2>");
}

const ESCAPE_TEXT: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (c) => ESCAPE_TEXT[c]);
}

/**
 * The question editor holds one paragraph, so anything block-shaped has to
 * become line breaks first: a second paragraph it cannot place is dropped, not
 * joined on.
 */
function collapseBlocks(html: string): string {
  return html
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi, "<br>")
    .replace(
      /<\/?(?:p|div|ul|ol|li|h[1-6]|table|thead|tbody|tr|t[dh]|blockquote|pre|section|article)\b[^>]*>/gi,
      "",
    )
    .replace(/^(?:\s|<br\s*\/?>)+/i, "")
    .replace(/(?:\s|<br\s*\/?>)+((?:<\/[a-z]+>\s*)*)$/i, "$1");
}

/** Stored question text as the editor's content. */
export function toEditorHtml(stored: string): string {
  const inline = restoreFormatTags(stored).replace(/\r?\n/g, "<br>");
  return `<p>${collapseBlocks(inline)}</p>`;
}

/**
 * The editor's HTML as stored question text: inline, no wrapping paragraph, and
 * an empty string when there is nothing in it. The server applies the same
 * shape on write (`sanitizeQuestionText`), so a saved question reads back as it
 * was sent.
 */
export function fromEditorHtml(html: string): string {
  const inline = html
    .replace(/<\/p>\s*<p[^>]*>/gi, "<br>")
    .replace(/<\/?p[^>]*>/gi, "")
    .replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, "");
  return isQuestionTextEmpty(inline) ? "" : inline;
}

/** Pasted plain text as editor HTML. */
export function plainTextToEditorHtml(text: string, singleLine = false) {
  return restoreFormatTags(escapeText(normalizeSymbols(text))).replace(
    /\r?\n/g,
    singleLine ? " " : "<br>",
  );
}

function usesSymbolFont(el: Element): boolean {
  const style = el.getAttribute("style") ?? "";
  return (
    /^\s*symbol\s*$/i.test(el.getAttribute("face") ?? "") ||
    /(?:^|[;\s])font-family:\s*["']?symbol["']?\s*(?:[;,]|$)/i.test(style) ||
    /mso-symbol-font-family:\s*symbol/i.test(style)
  );
}

/**
 * Pasted HTML (Word, Google Docs, a web page, a PDF viewer) reduced to text and
 * inline formatting. The editor's schema drops everything else it cannot hold,
 * so this only has to remove what would otherwise reach it as stray text, and
 * read Symbol-font runs as the characters they show: Word puts a plain "a" on
 * the clipboard for an α typed in that font.
 *
 * Parsed with `DOMParser` because a document built that way never loads images
 * or runs handlers, unlike assigning to `innerHTML`.
 */
export function cleanPastedHtml(html: string, singleLine = false): string {
  const doc = new DOMParser().parseFromString(
    normalizeSymbols(html).replace(/<!--[\s\S]*?-->/g, ""),
    "text/html",
  );
  doc.body
    .querySelectorAll("style, script, meta, link, title, xml")
    .forEach((el) => el.remove());
  // Word nests these spans, and a character must only be translated once.
  const translated = new Set<Node>();
  doc.body.querySelectorAll("[style], font[face]").forEach((el) => {
    if (!usesSymbolFont(el)) return;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (translated.has(node)) continue;
      translated.add(node);
      node.data = Array.from(
        node.data,
        (c) => symbolFontChar(c.codePointAt(0) ?? 0) ?? c,
      ).join("");
    }
  });
  const inline = collapseBlocks(
    doc.body.innerHTML.replace(/<\/?o:p\b[^>]*>/gi, ""),
  );
  return singleLine ? inline.replace(/<br\s*\/?>/gi, " ") : inline;
}
