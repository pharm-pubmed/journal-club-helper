// Builds the generated parts of the landing site (#29) from their sources:
//
//   site/privacy/index.html  from docs/PRIVACY.md (#28)
//   site/sample/index.html   from site/sample/summary.md, a real export that
//                            `pnpm store:assets` downloads from the extension
//   site/favicon.svg         from store/icon.svg (#27)
//
// `node scripts/build-site.mjs` writes them; `--check` fails if any is out of
// date, which CI runs, so the published policy cannot drift from the
// committed one. The Markdown reader covers only what those two files use:
// headings, paragraphs, bulleted and numbered lists, tables (with `\|` inside
// a cell), bold, inline code and links. Anything else is an error rather than
// being passed through half-converted.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Links must be absolute https or site-relative; anything else is refused. */
function safeHref(href) {
  if (/^https:\/\//.test(href) || /^\/[^/]/.test(href)) return escapeHtml(href);
  throw new Error(`Refusing link target "${href}": use https:// or a site path.`);
}

export function inline(text) {
  const out = [];
  // Code spans first, so nothing inside them is read as Markdown.
  // A link target may hold one level of parentheses, as some DOIs do.
  const pattern =
    /`([^`]+)`|<(https:\/\/[^>\s]+)>|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    out.push(escapeHtml(text.slice(last, match.index)));
    const [, code, auto, label, href, bold] = match;
    if (code !== undefined) out.push(`<code>${escapeHtml(code)}</code>`);
    else if (auto !== undefined) out.push(`<a href="${safeHref(auto)}">${escapeHtml(auto)}</a>`);
    else if (label !== undefined) out.push(`<a href="${safeHref(href)}">${inline(label)}</a>`);
    else out.push(`<strong>${inline(bold)}</strong>`);
    last = match.index + match[0].length;
  }
  out.push(escapeHtml(text.slice(last)));
  return out.join('');
}

/** A row's cells. The summary writes a `|` inside a cell as `\|`. */
const cells = (row) =>
  row
    .trim()
    .replace(/^\||(?<!\\)\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));

const ORDERED = /^(\d+)\.(?: |$)/;
const HEADING = /^(#{1,3}) (.+)$/;
/** Lines that end a paragraph. As in CommonMark, only a list starting at 1 can. */
const INTERRUPTS = /^(#{1,3} |\||- |1\.(?: |$))/;

/**
 * Converts the Markdown subset above to HTML. Returns `{ title, html }`.
 * `headingOffset` moves every heading down that many levels, for a page that
 * has its own `<h1>` above the converted text.
 */
export function markdownToHtml(markdown, { headingOffset = 0 } = {}) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let title = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      if (heading[1].length === 1) {
        if (title !== null) throw new Error('More than one top-level heading.');
        title = heading[2];
      }
      const level = heading[1].length + headingOffset;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      if (rows.length < 2 || !/^\|[\s:|-]+\|$/.test(rows[1].trim())) {
        throw new Error(`A table needs a header and a separator row: ${rows[0]}`);
      }
      const head = cells(rows[0]).map((cell) => `<th>${inline(cell)}</th>`);
      const body = rows.slice(2).map(
        (row) =>
          `<tr>${cells(row)
            .map((cell) => `<td>${inline(cell)}</td>`)
            .join('')}</tr>`,
      );
      html.push(
        `<table><thead><tr>${head.join('')}</tr></thead><tbody>${body.join('')}</tbody></table>`,
      );
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        let item = lines[i++].slice(2);
        // A wrapped list item continues on an indented line.
        while (i < lines.length && /^ {2}\S/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(`<li>${inline(item)}</li>`);
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (ORDERED.test(line)) {
      // The summary leaves its discussion questions as empty numbered items
      // for the reader to fill in, so an item may have no text.
      const start = Number(ORDERED.exec(line)[1]);
      const items = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(`<li>${inline(lines[i++].replace(ORDERED, ''))}</li>`);
      }
      html.push(`<ol${start === 1 ? '' : ` start="${start}"`}>${items.join('')}</ol>`);
      continue;
    }
    if (/^([*+] |>|```|<)/.test(line.trim()) || /^ {2,}/.test(line)) {
      throw new Error(`Unsupported Markdown, extend scripts/build-site.mjs: ${line}`);
    }
    // The first line always belongs to the paragraph, so a line such as
    // `#1 finding`, which is not a heading, cannot stop the reader in place.
    const paragraph = [lines[i++].trim()];
    while (i < lines.length && lines[i].trim() !== '' && !INTERRUPTS.test(lines[i])) {
      paragraph.push(lines[i++].trim());
    }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  if (title === null) throw new Error('No top-level heading.');
  return { title, html: html.join('\n') };
}

/**
 * The page around generated content. `source` names the file to edit instead.
 * Every generated page sits one directory below the site root, and links are
 * relative so the site works under a project Pages path such as
 * `<org>.github.io/journal-club-helper/` as well as at a domain root.
 */
function layout({ source, title, description, main, index = true }) {
  return `<!doctype html>
<!-- Generated from ${source} by scripts/build-site.mjs. Edit that file, not this one. -->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Journal Club Helper</title>
    <meta name="description" content="${escapeHtml(description)}" />${
      index ? '' : '\n    <meta name="robots" content="noindex" />'
    }
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="../style.css" />
  </head>
  <body>
    <header class="bar">
      <a class="brand" href="../"><img src="../favicon.svg" alt="" width="28" height="28" />Journal Club Helper</a>
    </header>
    <main class="doc">
${main}
    </main>
    <footer class="foot">
      <p>Educational use only, not clinical decision support. Not affiliated with NLM, NIH or HHS.</p>
    </footer>
  </body>
</html>
`;
}

export function privacyPage(markdown) {
  return layout({
    source: 'docs/PRIVACY.md',
    title: 'Privacy policy',
    description:
      'What Journal Club Helper stores, where, and the one request it makes only when you ask.',
    main: markdownToHtml(markdown).html,
  });
}

/**
 * A real export, shown as the landing page's example of the output (spec
 * §11). The note above it says which parts a person typed, so the example is
 * never mistaken for something the extension concluded on its own.
 */
export function samplePage(markdown) {
  const { html } = markdownToHtml(markdown, { headingOffset: 1 });
  return layout({
    source: 'site/sample/summary.md',
    title: 'Example one-page summary',
    description: 'An unedited one-page summary exported from Journal Club Helper.',
    // A reader's bottom line on a real paper should not turn up in searches
    // for that paper's title.
    index: false,
    // What the note says a person did is what store/capture.spec.ts does.
    main: `<h1>Example one-page summary</h1>
<div class="note">
<p>This is a one-page summary exported from Journal Club Helper, unedited, for a published meta-analysis in The BMJ. For this example a person did what a reader would: typed the PICO, chose which of the abstract's ratios to use and entered the baseline risk to apply it to, marked two checklist questions Unclear with a note on each, and wrote the bottom line. The rest is what the extension filled in or calculated, or left blank for the reader.</p>
<p>The absolute figures are calculated from the relative risk and that baseline risk, so they differ a little from the crude rates the abstract reports. The bottom line only shows what a reader might write. It is not a clinical conclusion and not advice.</p>
<p><a href="summary.md">The exported Markdown file</a> is available as well.</p>
</div>
${html}`,
  });
}

const OUTPUTS = [
  {
    path: 'site/privacy/index.html',
    build: () => privacyPage(readFileSync('docs/PRIVACY.md', 'utf8')),
  },
  {
    path: 'site/sample/index.html',
    build: () => samplePage(readFileSync('site/sample/summary.md', 'utf8')),
  },
  { path: 'site/favicon.svg', build: () => readFileSync('store/icon.svg', 'utf8') },
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const { path, build } of OUTPUTS) {
    const wanted = build();
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // Missing counts as stale.
    }
    if (current === wanted) continue;
    if (check) stale.push(path);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, wanted);
      console.log(`wrote ${path}`);
    }
  }
  if (stale.length > 0) {
    console.error(
      `Out of date: ${stale.join(', ')}. Run \`node scripts/build-site.mjs\` and commit the result.`,
    );
    process.exit(1);
  }
}
