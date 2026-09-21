/**
 * Reading a PubMed abstract page out of its DOM (issue #4, spec §4.1).
 *
 * The extractor is a pure function over a `Document` so it can be unit tested
 * against saved HTML fixtures; it never reads `window` or `document` itself.
 * This is the only file under `src/lib` allowed to reference DOM types.
 *
 * `<meta name="citation_*">` tags are preferred over layout classes because the
 * layout classes change with PubMed redesigns while the citation metadata does
 * not. Two meta dialects exist in the wild and both are handled: repeated
 * `citation_author` + `citation_publication_date` (NLM-supplied records) and a
 * single `citation_authors` + `citation_date` (publisher-supplied records).
 */

import { parsePmidFromUrl } from './pubmed-url';
import type { AbstractSection, PubMedArticle } from './types';

export type { AbstractSection, PubMedArticle } from './types';

/* ------------------------------------------------------------------ helpers */

function text(node: Node | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value) return value;
  }
  return '';
}

function metaContent(doc: Document, name: string): string | null {
  const content = doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim();
  return content ? content : null;
}

function metaContents(doc: Document, name: string): string[] {
  return Array.from(doc.querySelectorAll(`meta[name="${name}"]`))
    .map((element) => element.getAttribute('content')?.trim() ?? '')
    .filter((value) => value.length > 0);
}

/**
 * Reads `#publication-types` / `#mesh-terms`. Some pages render every keyword as
 * a dropdown whose menu contains its own `<li>` links, so only the direct list
 * children are read and the trigger button supplies the plain label.
 */
function keywordList(doc: Document, sectionId: string): string[] {
  const list =
    doc.querySelector(`#${sectionId} ul.keywords-list`) ?? doc.querySelector(`#${sectionId} ul`);
  if (!list) return [];
  const keywords: string[] = [];
  for (const child of Array.from(list.children)) {
    if (child.tagName !== 'LI') continue;
    const value = text(child.querySelector('.keyword-actions-trigger') ?? child);
    if (value) keywords.push(value);
  }
  return keywords;
}

/* ----------------------------------------------------------------- abstract */

interface AbstractParagraph {
  /** null when the paragraph carries no `strong.sub-title`. */
  label: string | null;
  text: string;
}

function normalizeLabel(raw: string): string {
  return raw.replace(/\s*:\s*$/, '').toUpperCase();
}

function textWithout(parent: Element, skipped: Element): string {
  let value = '';
  for (const node of Array.from(parent.childNodes)) {
    if (node === skipped) continue;
    value += node.textContent ?? '';
  }
  return value.replace(/\s+/g, ' ').trim();
}

/** Picks the English abstract when a translated one is rendered alongside it. */
function findAbstractContent(doc: Document): Element | null {
  const root = doc.querySelector('#abstract');
  if (!root) return null;
  return (
    root.querySelector('.abstract-content.selected') ??
    root.querySelector('#eng-abstract') ??
    root.querySelector('.abstract-content') ??
    null
  );
}

function readParagraphs(content: Element): AbstractParagraph[] {
  const paragraphs = Array.from(content.querySelectorAll('p'));
  const elements: Element[] = paragraphs.length > 0 ? paragraphs : [content];
  const result: AbstractParagraph[] = [];
  for (const element of elements) {
    const subTitle = element.querySelector('strong.sub-title');
    const body = subTitle ? textWithout(element, subTitle) : text(element);
    if (!body) continue;
    result.push({ label: subTitle ? normalizeLabel(text(subTitle)) : null, text: body });
  }
  return result;
}

/** Unlabelled paragraphs belong to the section above them. */
function buildSections(paragraphs: AbstractParagraph[]): AbstractSection[] {
  const sections: AbstractSection[] = [];
  for (const paragraph of paragraphs) {
    const previous = sections[sections.length - 1];
    if (paragraph.label === null && previous) {
      previous.text = `${previous.text}\n\n${paragraph.text}`;
      continue;
    }
    sections.push({ label: paragraph.label ?? '', text: paragraph.text });
  }
  return sections;
}

/* ---------------------------------------------------------------- citation */

function findPmid(doc: Document, url?: string): string | null {
  const fromMeta = metaContent(doc, 'citation_pmid');
  return (
    (url === undefined ? null : parsePmidFromUrl(url)) ??
    parsePmidFromUrl(doc.URL ?? '') ??
    (fromMeta !== null && /^\d+$/.test(fromMeta) ? fromMeta : null) ??
    parsePmidFromUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '')
  );
}

function findAuthors(doc: Document): string[] {
  const separate = metaContents(doc, 'citation_author');
  if (separate.length > 0) return separate;
  const joined = metaContent(doc, 'citation_authors');
  if (joined) {
    return joined
      .split(';')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }
  return Array.from(doc.querySelectorAll('.authors-list .full-name'))
    .map((element) => text(element))
    .filter((name) => name.length > 0);
}

function findYear(doc: Document): string {
  const year = (value: string | null): string | null => {
    const match = value === null ? null : /(?:19|20)\d{2}/.exec(value);
    return match?.[0] ?? null;
  };
  return firstNonEmpty(
    year(metaContent(doc, 'citation_publication_date')),
    year(metaContent(doc, 'citation_date')),
    year(text(doc.querySelector('.article-source .cit'))),
    year(text(doc.querySelector('.cit'))),
  );
}

/* ------------------------------------------------------------------- public */

/**
 * Builds a `PubMedArticle` from an abstract page.
 *
 * Returns null — never throws — when the page has no readable abstract or no
 * resolvable PMID, so the panel can offer the E-utilities fallback (#23).
 *
 * @param doc  the abstract page.
 * @param url  optional page URL. Pass it when `doc.URL` is not the PubMed URL,
 *             for example a document built by `DOMParser` in a test.
 */
export function extractArticleFromDocument(doc: Document, url?: string): PubMedArticle | null {
  const content = findAbstractContent(doc);
  if (!content) return null;

  const paragraphs = readParagraphs(content);
  const structured = paragraphs.some((paragraph) => paragraph.label !== null);
  const abstractSections = structured ? buildSections(paragraphs) : [];
  const abstract = structured
    ? abstractSections.map((section) => section.text).join('\n\n')
    : paragraphs.map((paragraph) => paragraph.text).join('\n\n');
  if (!abstract) return null;

  const pmid = findPmid(doc, url);
  if (!pmid) return null;

  return {
    pmid,
    title: firstNonEmpty(
      metaContent(doc, 'citation_title'),
      text(doc.querySelector('h1.heading-title')),
    ),
    abstract,
    abstractSections,
    publicationTypes: keywordList(doc, 'publication-types'),
    meshTerms: keywordList(doc, 'mesh-terms'),
    authors: findAuthors(doc),
    journal: firstNonEmpty(
      metaContent(doc, 'citation_journal_abbrev'),
      text(doc.querySelector('#full-view-journal-trigger')),
      text(doc.querySelector('.article-source .journal')),
      metaContent(doc, 'citation_journal_title'),
    ),
    year: findYear(doc),
    doi:
      firstNonEmpty(
        metaContent(doc, 'citation_doi'),
        text(doc.querySelector('.identifier.doi a.id-link')),
        text(doc.querySelector('.identifier.doi a')),
      ) || null,
    source: 'dom',
  };
}
