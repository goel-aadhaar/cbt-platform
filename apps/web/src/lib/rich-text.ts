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
