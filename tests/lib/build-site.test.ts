/**
 * The Markdown reader that publishes docs/PRIVACY.md and the example summary
 * on the landing site (#29). It only has to cover what those two files use,
 * but it must never pass markup through unescaped or publish a link that is
 * not https.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs script with no type declarations.
import { inline, markdownToHtml, privacyPage, samplePage } from '../../scripts/build-site.mjs';

describe('the landing site builder', () => {
  it('escapes HTML in text and in code spans', () => {
    expect(inline('a <script> & `<b>`')).toBe('a &lt;script&gt; &amp; <code>&lt;b&gt;</code>');
  });

  it('turns bold, code, links and autolinks into HTML', () => {
    expect(
      inline('**Delete:** see [the FAQ](https://example.org/faq) or <https://a.example>'),
    ).toBe(
      '<strong>Delete:</strong> see <a href="https://example.org/faq">the FAQ</a> or ' +
        '<a href="https://a.example">https://a.example</a>',
    );
  });

  it('refuses a link that is neither https nor a site path', () => {
    expect(() => inline('[x](javascript:alert(1))')).toThrow(/Refusing link/);
    expect(() => inline('[x](http://example.org)')).toThrow(/Refusing link/);
    expect(inline('[x](/privacy/)')).toBe('<a href="/privacy/">x</a>');
  });

  it('reads headings, paragraphs, lists and tables', () => {
    const { title, html } = markdownToHtml(
      [
        '# Title',
        '',
        '**Bold** opening line',
        'continues here.',
        '',
        '- one',
        '- two',
        '  wrapped',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | `2` |',
      ].join('\n'),
    );
    expect(title).toBe('Title');
    expect(html).toBe(
      [
        '<h1>Title</h1>',
        '<p><strong>Bold</strong> opening line continues here.</p>',
        '<ul><li>one</li><li>two wrapped</li></ul>',
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><code>2</code></td></tr></tbody></table>',
      ].join('\n'),
    );
  });

  it('reads numbered lists, empty items included, and escaped pipes in a table cell', () => {
    const { html } = markdownToHtml(
      [
        '# T',
        'Questions:',
        '1. First',
        '2.',
        '',
        '| Element | Detail |',
        '| --- | --- |',
        '| Outcome | death \\| stroke |',
      ].join('\n'),
    );
    expect(html).toBe(
      [
        '<h1>T</h1>',
        '<p>Questions:</p>',
        '<ol><li>First</li><li></li></ol>',
        '<table><thead><tr><th>Element</th><th>Detail</th></tr></thead><tbody><tr><td>Outcome</td><td>death | stroke</td></tr></tbody></table>',
      ].join('\n'),
    );
  });

  it('keeps a number that only continues a paragraph, and numbers a list from where it starts', () => {
    expect(markdownToHtml('# T\nPublished in\n2022. It was large.').html).toBe(
      '<h1>T</h1>\n<p>Published in 2022. It was large.</p>',
    );
    expect(markdownToHtml('# T\nQuestions:\n1. First').html).toBe(
      '<h1>T</h1>\n<p>Questions:</p>\n<ol><li>First</li></ol>',
    );
    expect(markdownToHtml('# T\n\n2022. PMID 1.').html).toBe(
      '<h1>T</h1>\n<ol start="2022"><li>PMID 1.</li></ol>',
    );
  });

  it('reads a line that starts with # but is not a heading as text, instead of stopping', () => {
    expect(markdownToHtml('# T\n\n#1 finding\nmore').html).toBe(
      '<h1>T</h1>\n<p>#1 finding more</p>',
    );
  });

  it('keeps parentheses inside a link target, as in some DOIs', () => {
    expect(inline('[doi](https://doi.org/10.1016/S0140-6736(20)30183-5).')).toBe(
      '<a href="https://doi.org/10.1016/S0140-6736(20)30183-5">doi</a>.',
    );
  });

  it('moves headings down when the page has its own h1', () => {
    expect(markdownToHtml('# T\n\n## S', { headingOffset: 1 }).html).toBe('<h2>T</h2>\n<h3>S</h3>');
  });

  it('fails on Markdown it does not understand instead of publishing it half-converted', () => {
    expect(() => markdownToHtml('# T\n\n* starred')).toThrow(/Unsupported Markdown/);
    expect(() => markdownToHtml('# T\n\n```\ncode\n```')).toThrow(/Unsupported Markdown/);
    expect(() => markdownToHtml('no heading')).toThrow(/No top-level heading/);
  });

  it('publishes every heading of the committed policy', () => {
    const markdown = readFileSync('docs/PRIVACY.md', 'utf8');
    const page: string = privacyPage(markdown);
    for (const [, text] of markdown.matchAll(/^#{1,3} (.+)$/gm)) {
      expect(page).toContain(`>${inline(text)}</h`);
    }
  });

  it('publishes the example summary with the note on what a person typed', () => {
    const markdown = readFileSync('site/sample/summary.md', 'utf8');
    const page: string = samplePage(markdown);
    expect(page).toContain('<h1>Example one-page summary</h1>');
    expect(page).toContain('a person did what a reader would');
    expect(page).toContain('not a clinical conclusion');
    expect(page).toContain('<meta name="robots" content="noindex" />');
    for (const [, text] of markdown.matchAll(/^#{1,3} (.+)$/gm)) {
      expect(page).toContain(`>${inline(text)}</h`);
    }
  });

  // Pages serves the site under /journal-club-helper/ until there is a domain,
  // so a link from the root would leave it.
  it('links only relatively, to files that exist', () => {
    for (const page of ['site/index.html', 'site/privacy/index.html', 'site/sample/index.html']) {
      const html = readFileSync(page, 'utf8');
      for (const [, target] of html.matchAll(/\b(?:href|src|poster)="([^"]*)"/g)) {
        if (/^(https:|mailto:|#|TBD\()/.test(target)) continue;
        expect(target, `${page}: ${target}`).not.toMatch(/^\//);
        const file = join(dirname(page), target);
        expect(
          existsSync(target.endsWith('/') || target === '.' ? join(file, 'index.html') : file),
          `${page}: ${target}`,
        ).toBe(true);
      }
    }
  });
});
