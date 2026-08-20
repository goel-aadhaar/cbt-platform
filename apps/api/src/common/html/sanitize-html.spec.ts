import { sanitizeRichText } from './sanitize-html';

/**
 * `instructions` (§ exam authoring) is the first free-form HTML field in the
 * app — this is the single write-boundary sanitizer for it, so it must strip
 * anything the Tiptap toolbar can't itself produce.
 */
describe('sanitizeRichText', () => {
  it('keeps allowed formatting tags', () => {
    expect(
      sanitizeRichText('<p><strong>Bold</strong> and <em>italic</em></p>'),
    ).toBe('<p><strong>Bold</strong> and <em>italic</em></p>');
  });

  it('keeps lists and blockquotes', () => {
    expect(sanitizeRichText('<ul><li>one</li><li>two</li></ul>')).toBe(
      '<ul><li>one</li><li>two</li></ul>',
    );
    expect(sanitizeRichText('<blockquote>quoted</blockquote>')).toBe(
      '<blockquote>quoted</blockquote>',
    );
  });

  it('strips script tags entirely, including their content', () => {
    expect(sanitizeRichText('<p>hi</p><script>alert(1)</script>')).toBe(
      '<p>hi</p>',
    );
  });

  it('strips event handler attributes', () => {
    expect(sanitizeRichText('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>');
  });

  it('strips disallowed tags like iframe and style', () => {
    expect(sanitizeRichText('<iframe src="evil"></iframe><p>ok</p>')).toBe(
      '<p>ok</p>',
    );
  });

  it('keeps a safe link and forces target/rel', () => {
    expect(sanitizeRichText('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>',
    );
  });

  it('drops a javascript: link href', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">link</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">link</a>',
    );
  });
});
