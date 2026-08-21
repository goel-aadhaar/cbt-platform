// Pinned exactly (package.json has no "^") at 2.17.1: 2.17.2+ bumped its
// htmlparser2 dependency to a pure-ESM build ("type": "module", no CJS
// export), which Jest's default CJS transform can't load. Bump this pin only
// alongside a matching Jest ESM-transform fix.
import sanitizeHtmlLib from 'sanitize-html';

/**
 * Allowlist matching exactly what the Tiptap toolbar
 * (`apps/web/src/components/admin/rich-text-editor.tsx`, StarterKit + Link)
 * can produce — bold/italic/strike, lists, blockquote, links, inline/block
 * code. Anything else (scripts, iframes, style, on* attributes) is stripped,
 * not escaped, since this is the only place free-form HTML enters the app.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'code',
      'pre',
      // Science notation: H<sub>2</sub>SO<sub>4</sub>, x<sup>2</sup>. Neither
      // can carry an attribute or a URL, so allowing them adds no attack
      // surface — and without them a chemistry paper cannot state a formula.
      'sub',
      'sup',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },
  });
}

/**
 * Sanitize a question's statement or explanation.
 *
 * These were stored **raw** and rendered as plain text, so nothing was escaped
 * and nothing was stripped — safe only because the text never reached a HTML
 * parser. Rendering notation means it now does, which makes sanitizing on write
 * a prerequisite rather than a nicety: this is the highest-stakes screen in the
 * product, and a stored script in a question statement would execute inside a
 * live exam.
 *
 * Same allowlist as the rich-text fields. Maths written as `$…$` or `\\(…\\)`
 * passes through untouched — it is plain text at this layer, and the browser
 * typesets it after this sanitizer has already had its say, never before.
 */
export function sanitizeQuestionText(text: string): string {
  return sanitizeRichText(text);
}
