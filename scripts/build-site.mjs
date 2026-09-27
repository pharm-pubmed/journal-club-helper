// Builds the generated parts of the landing site (#29) from their sources:
//
//   site/privacy/index.html  from docs/PRIVACY.md (#28)
//   site/favicon.svg         from store/icon.svg (#27)
//
// `node scripts/build-site.mjs` writes them; `--check` fails if either is out
// of date, which CI runs, so the published policy cannot drift from the
// committed one. The Markdown reader covers only what PRIVACY.md uses:
// headings, paragraphs, lists, tables, bold, inline code and links. Anything
// else is an error rather than being passed through half-converted.
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
  const pattern = /`([^`]+)`|<(https:\/\/[^>\s]+)>|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
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

const cells = (row) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

/** Converts the Markdown subset above to HTML. Returns `{ title, html }`. */
export function markdownToHtml(markdown) {
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
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) {
        if (title !== null) throw new Error('More than one top-level heading.');
        title = heading[2];
      }
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
    if (/^(\d+\. |[*+] |>|```|<)/.test(line.trim()) || /^ {2,}/.test(line)) {
      throw new Error(`Unsupported Markdown, extend scripts/build-site.mjs: ${line}`);
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|\||- )/.test(lines[i])) {
      paragraph.push(lines[i++].trim());
    }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  if (title === null) throw new Error('No top-level heading.');
  return { title, html: html.join('\n') };
}

export function privacyPage(markdown) {
  const { html } = markdownToHtml(markdown);
  return `<!doctype html>
<!-- Generated from docs/PRIVACY.md by scripts/build-site.mjs. Edit that file, not this one. -->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy policy · Journal Club Helper</title>
    <meta name="description" content="What Journal Club Helper stores, where, and the one request it makes only when you ask." />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="bar">
      <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28" />Journal Club Helper</a>
    </header>
    <main class="doc">
${html}
    </main>
    <footer class="foot">
      <p>Educational use only. Not affiliated with NLM, NIH or HHS.</p>
    </footer>
  </body>
</html>
`;
}

const OUTPUTS = [
  {
    path: 'site/privacy/index.html',
    build: () => privacyPage(readFileSync('docs/PRIVACY.md', 'utf8')),
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
