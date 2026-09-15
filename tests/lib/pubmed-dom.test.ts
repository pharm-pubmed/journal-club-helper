// @vitest-environment happy-dom
// The fixtures link to NCBI stylesheets; happy-dom would fetch them over the network.
// @vitest-environment-options { "settings": { "disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true } }
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractArticleFromDocument } from '../../src/lib/pubmed-dom';
import type { PubMedArticle } from '../../src/lib/types';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function fixture(name: string): Document {
  // Vitest runs from the repository root; happy-dom rewrites import.meta.url.
  return parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/pubmed', name), 'utf8'));
}

/** Real pages saved from PubMed; the publication type in each name is asserted below. */
const FIXTURES = [
  { file: 'rct-36577095.html', pmid: '36577095', publicationType: 'Randomized Controlled Trial' },
  { file: 'meta-analysis-36740866.html', pmid: '36740866', publicationType: 'Meta-Analysis' },
  { file: 'cohort-34844936.html', pmid: '34844936', publicationType: 'Observational Study' },
] as const;

describe('extractArticleFromDocument (fixtures)', () => {
  for (const { file, pmid, publicationType } of FIXTURES) {
    describe(file, () => {
      const article = extractArticleFromDocument(fixture(file));

      it('extracts an article', () => {
        expect(article).not.toBeNull();
      });

      it('reads the PMID from the citation meta tag', () => {
        expect(article?.pmid).toBe(pmid);
      });

      it('reads a non-empty title', () => {
        expect(article?.title.length ?? 0).toBeGreaterThan(10);
      });

      it('reads the expected publication type', () => {
        expect(article?.publicationTypes).toContain(publicationType);
        // The dropdown menu inside each <li> must not leak into the list.
        expect(article?.publicationTypes.join(' ')).not.toContain('Search in PubMed');
      });

      it('reads a non-empty abstract', () => {
        expect(article?.abstract.length ?? 0).toBeGreaterThan(200);
      });

      it('reads the DOI', () => {
        expect(article?.doi).toMatch(/^10\.\d{4,}\//);
      });

      it('reads authors, journal, year and MeSH terms', () => {
        expect(article?.authors.length ?? 0).toBeGreaterThan(0);
        expect(article?.journal.length ?? 0).toBeGreaterThan(0);
        expect(article?.year).toMatch(/^(19|20)\d{2}$/);
        expect(article?.meshTerms.length ?? 0).toBeGreaterThan(0);
      });

      it('marks the source as dom', () => {
        expect(article?.source).toBe('dom');
      });

      it('splits the structured abstract into labelled sections', () => {
        const sections = article?.abstractSections ?? [];
        expect(sections.length).toBeGreaterThan(2);
        for (const section of sections) {
          expect(section.label).toBe(section.label.toUpperCase());
          expect(section.label).not.toMatch(/:$/);
          expect(section.label.length).toBeGreaterThan(0);
          expect(section.text.length).toBeGreaterThan(0);
        }
        expect(article?.abstract).toBe(sections.map((s) => s.text).join('\n\n'));
      });
    });
  }
});

describe('extractArticleFromDocument (rct fixture details)', () => {
  const article = extractArticleFromDocument(fixture('rct-36577095.html')) as PubMedArticle;

  it('names the four IMRaD sections of the NEJM abstract', () => {
    expect(article.abstractSections.map((s) => s.label)).toEqual([
      'BACKGROUND',
      'METHODS',
      'RESULTS',
      'CONCLUSIONS',
    ]);
  });

  it('strips the section label out of the section text', () => {
    expect(article.abstractSections[0]?.text.startsWith('Background')).toBe(false);
    expect(article.abstract).not.toContain('Background:');
  });

  it('collapses the markup whitespace', () => {
    expect(article.abstract).not.toMatch(/ {2,}/);
    expect(article.title).toBe(
      'VV116 versus Nirmatrelvir-Ritonavir for Oral Treatment of Covid-19',
    );
  });
});

describe('extractArticleFromDocument (synthetic documents)', () => {
  it('returns null when the page has no abstract element', () => {
    const doc = parse(`
      <html><head><meta name="citation_pmid" content="12345"></head>
      <body><h1 class="heading-title">A title with no abstract</h1></body></html>
    `);
    expect(extractArticleFromDocument(doc)).toBeNull();
  });

  it('returns null when the abstract element is empty', () => {
    const doc = parse(`
      <html><head><meta name="citation_pmid" content="12345"></head>
      <body><div class="abstract" id="abstract"><h2 class="title">Abstract</h2>
      <div class="abstract-content selected" id="eng-abstract"></div></div></body></html>
    `);
    expect(extractArticleFromDocument(doc)).toBeNull();
  });

  it('returns null when no PMID can be resolved', () => {
    const doc = parse(`
      <html><body><div id="abstract"><div class="abstract-content"><p>Some abstract text.</p></div></div></body></html>
    `);
    expect(extractArticleFromDocument(doc)).toBeNull();
  });

  it('leaves abstractSections empty for an unstructured abstract', () => {
    const doc = parse(`
      <html><head><meta name="citation_pmid" content="12345"></head>
      <body><h1 class="heading-title">Unstructured   title</h1>
      <div id="abstract"><div class="abstract-content"><p>First paragraph.</p><p>Second paragraph.</p></div></div>
      </body></html>
    `);
    const article = extractArticleFromDocument(doc);
    expect(article?.abstractSections).toEqual([]);
    expect(article?.abstract).toBe('First paragraph.\n\nSecond paragraph.');
    expect(article?.title).toBe('Unstructured title');
    expect(article?.doi).toBeNull();
  });

  it('takes the PMID from the optional url argument before the meta tag', () => {
    const doc = parse(`
      <html><head><meta name="citation_pmid" content="12345"></head>
      <body><div id="abstract"><div class="abstract-content"><p>Text.</p></div></div></body></html>
    `);
    expect(extractArticleFromDocument(doc, 'https://pubmed.ncbi.nlm.nih.gov/999/')?.pmid).toBe(
      '999',
    );
    expect(extractArticleFromDocument(doc, 'https://example.com/nope')?.pmid).toBe('12345');
  });

  it('prefers the English abstract when a translation is also rendered', () => {
    const doc = parse(`
      <html><head><meta name="citation_pmid" content="12345"></head>
      <body><div id="abstract">
        <div class="abstract-content" id="fre-abstract"><p>Texte francais.</p></div>
        <div class="abstract-content selected" id="eng-abstract"><p>English text.</p></div>
      </div></body></html>
    `);
    expect(extractArticleFromDocument(doc)?.abstract).toBe('English text.');
  });
});
