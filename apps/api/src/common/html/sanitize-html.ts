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
