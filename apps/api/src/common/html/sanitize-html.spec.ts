import {
  questionPlainText,
  questionTextPreview,
  questionTextRuns,
  sanitizeQuestionText,
  sanitizeRichText,
} from './sanitize-html';

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

/**
 * One stored form for every screen. Each case here is something a client saw go
 * wrong: `&amp;` on screen, raw `<sub>` tags, a formula with a hole in it.
 */
describe('sanitizeQuestionText', () => {
  it('stores & escaped exactly once, however it arrives', () => {
    expect(sanitizeQuestionText('Fe & Cu')).toBe('Fe &amp; Cu');
    expect(sanitizeQuestionText('Fe &amp; Cu')).toBe('Fe &amp; Cu');
  });

  it('turns formatting tags that arrived as text into formatting', () => {
    expect(sanitizeQuestionText('CO&lt;sub&gt;2&lt;/sub&gt;')).toBe(
      'CO<sub>2</sub>',
    );
    expect(sanitizeQuestionText('CO<sub>2</sub>')).toBe('CO<sub>2</sub>');
  });

  it('keeps every formatting mark the editor offers', () => {
    const html =
      '<strong>H</strong><em>e</em><u>l</u>l<sub>o</sub> x<sup>2</sup>';
    expect(sanitizeQuestionText(html)).toBe(html);
  });

  it('normalises the older spellings of bold and italic', () => {
    expect(sanitizeQuestionText('<b>a</b> <i>b</i>')).toBe(
      '<strong>a</strong> <em>b</em>',
    );
  });

  it('strips what is unsafe and keeps what is valid', () => {
    expect(
      sanitizeQuestionText('<script>alert(1)</script><b onclick="x()">ok</b>'),
    ).toBe('<strong>ok</strong>');
    expect(sanitizeQuestionText('<img src=x onerror=alert(1)>hi')).toBe('hi');
  });

  it('leaves no way to smuggle a tag through the less-than handling', () => {
    expect(sanitizeQuestionText('<img src=x onerror=alert(1)')).not.toContain(
      '<img',
    );
  });

  it('keeps a less-than sign that is not a tag', () => {
    expect(sanitizeQuestionText('if a<b and c>d then x < 5')).toBe(
      'if a&lt;b and c&gt;d then x &lt; 5',
    );
  });

  it('keeps formula source whole, including its < and &', () => {
    const stored = sanitizeQuestionText('Solve $a<b$ and $x & y$ now');
    expect(stored).toBe('Solve $a&lt;b$ and $x &amp; y$ now');
    expect(sanitizeQuestionText(stored)).toBe(stored);
  });

  it('drops marks the editor put inside a formula', () => {
    expect(sanitizeQuestionText('$x<strong>2</strong>$')).toBe('$x2$');
  });

  it('reads two prices as text, keeping the formatting between them', () => {
    const stored = sanitizeQuestionText(
      'A pen costs $5 and <strong>a book</strong> costs $10',
    );
    expect(stored).toBe('A pen costs $5 and <strong>a book</strong> costs $10');
    expect(sanitizeQuestionText(stored)).toBe(stored);
  });

  it('still keeps a formula next to a price, and an escaped dollar', () => {
    expect(sanitizeQuestionText('Rs $5 for $x<sup>2</sup>$')).toBe(
      'Rs $5 for $x2$',
    );
    expect(sanitizeQuestionText('costs \\$5 and <em>\\$10</em>')).toBe(
      'costs \\$5 and <em>\\$10</em>',
    );
  });

  it('does not run a formula across a line break', () => {
    expect(sanitizeQuestionText('Pay $5<br><strong>then</strong> $x$')).toBe(
      'Pay $5<br><strong>then</strong> $x$',
    );
  });

  it('collapses paragraphs and newlines into line breaks', () => {
    expect(sanitizeQuestionText('<p>one</p><p>two</p>')).toBe('one<br>two');
    expect(sanitizeQuestionText('one\ntwo')).toBe('one<br>two');
    expect(sanitizeQuestionText('<p>one<br></p>')).toBe('one');
  });

  it('preserves Unicode science symbols and repairs Symbol-font ones', () => {
    expect(sanitizeQuestionText('α β Δ μ ± × ÷ ° → ≥ ≠ √ ∞ π Ω Σ H₂O x²')).toBe(
      'α β Δ μ ± × ÷ ° → ≥ ≠ √ ∞ π Ω Σ H₂O x²',
    );
    expect(sanitizeQuestionText('\uF061 \uF0B3 1')).toBe('α ≥ 1');
  });

  it('is unchanged by a second pass', () => {
    const inputs = [
      'CO<sub>2</sub> &amp; H<sub>2</sub>O',
      'a < b & c > d',
      '<strong>Bold</strong> then $\frac{1}{2}$<br>next line',
    ];
    for (const input of inputs) {
      const once = sanitizeQuestionText(input);
      expect(sanitizeQuestionText(once)).toBe(once);
    }
  });
});

describe('questionPlainText', () => {
  it('drops markup and decodes entities', () => {
    expect(questionPlainText('CO<sub>2</sub> &amp; H<sub>2</sub>O')).toBe(
      'CO2 & H2O',
    );
    expect(questionPlainText('one<br>two')).toBe('one\ntwo');
  });

  it('shows an escaped dollar as a dollar', () => {
    expect(questionPlainText('costs \\$5')).toBe('costs $5');
  });
});

describe('questionTextRuns', () => {
  it('carries each mark on its own run', () => {
    expect(questionTextRuns('<strong>H</strong><sub>2</sub>O &amp; x')).toEqual(
      [
        { text: 'H', bold: true },
        { text: '2', subScript: true },
        { text: 'O & x' },
      ],
    );
  });

  it('marks a line break on the run after it', () => {
    expect(questionTextRuns('one<br>two')).toEqual([
      { text: 'one' },
      { text: 'two', lineBreak: true },
    ]);
  });
});

describe('questionTextPreview', () => {
  it('leaves text within the limit untouched', () => {
    expect(questionTextPreview('CO<sub>2</sub> &amp; O<sub>2</sub>', 20)).toBe(
      'CO<sub>2</sub> &amp; O<sub>2</sub>',
    );
  });

  it('closes a mark it cuts through', () => {
    expect(questionTextPreview('<strong>abcdef</strong> rest', 3)).toBe(
      '<strong>abc</strong>...',
    );
  });

  it('never stops inside an entity or a formula', () => {
    expect(questionTextPreview('a &amp; b c', 3)).toBe('a &amp;...');
    expect(questionTextPreview('see $x^2 + y^2$ and more', 5)).toBe(
      'see $x^2 + y^2$...',
    );
  });
});
