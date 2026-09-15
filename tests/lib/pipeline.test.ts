// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true } }
/**
 * End-to-end over real PubMed pages.
 *
 * Every module below is unit-tested in isolation against hand-written text. This
 * file is the one place where the whole chain runs over markup NCBI actually
 * served: DOM extraction, design detection, the checklist that design selects,
 * number extraction and PICO candidates. Two real misses were found this way and
 * fixed (a plural "hazard ratios of 0.89", and a PARTICIPANTS section whose
 * wording matched no P cue), so the fixtures are worth keeping honest.
 *
 * The offset assertions are the important ones: the PICO tab builds <mark>
 * elements from those numbers, and a one-character drift shows up as visibly
 * mangled text rather than as a test failure anywhere else.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getChecklist } from '../../src/lib/checklist-schema';
import { classifyDesign } from '../../src/lib/design-classifier';
import { extractNumberCandidates } from '../../src/lib/number-extractor';
import { findPicoCandidates } from '../../src/lib/pico-candidates';
import { extractArticleFromDocument } from '../../src/lib/pubmed-dom';
import type { StudyDesign } from '../../src/lib/types';

interface Expectation {
  file: string;
  pmid: string;
  design: StudyDesign;
  subtype: string | null;
  /** Kinds the extractor must find at least one of. */
  numberKinds: string[];
  /** PICO fields that must have at least one candidate drawn from the abstract. */
  picoFromAbstract: string[];
}

const FIXTURES: Expectation[] = [
  {
    file: 'rct-36577095.html',
    pmid: '36577095',
    design: 'rct',
    subtype: 'non-inferiority',
    numberKinds: ['percent-pair'],
    picoFromAbstract: ['P', 'I', 'O'],
  },
  {
    file: 'meta-analysis-36740866.html',
    pmid: '36740866',
    design: 'sr-ma',
    subtype: 'meta-analysis',
    numberKinds: ['ratio'],
    picoFromAbstract: ['O'],
  },
  {
    file: 'cohort-34844936.html',
    pmid: '34844936',
    design: 'cohort',
    subtype: null,
    numberKinds: ['ratio'],
    picoFromAbstract: ['P', 'O'],
  },
];

function parse(file: string): Document {
  const html = readFileSync(resolve(__dirname, '../fixtures/pubmed', file), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe.each(FIXTURES)('$file', (expected) => {
  const article = extractArticleFromDocument(parse(expected.file));

  it('extracts a usable article', () => {
    expect(article).not.toBeNull();
    expect(article?.pmid).toBe(expected.pmid);
    expect(article?.title.length).toBeGreaterThan(20);
    expect(article?.abstract.length).toBeGreaterThan(500);
    expect(article?.publicationTypes.length).toBeGreaterThan(0);
    expect(article?.abstractSections.length).toBeGreaterThan(0);
  });

  it('classifies the design and picks the matching checklist', () => {
    if (!article) throw new Error('no article');
    const classification = classifyDesign({
      publicationTypes: article.publicationTypes,
      abstract: article.abstract,
      title: article.title,
    });

    expect(classification.design).toBe(expected.design);
    expect(classification.subtype).toBe(expected.subtype);
    // A real publication type is on every one of these, so keyword-level
    // confidence would mean the publication-type rules stopped firing.
    expect(classification.confidence).toBe('high');
    expect(classification.evidence.length).toBeGreaterThan(0);

    const checklist = getChecklist(classification.design);
    expect(checklist.id).toBe(expected.design);
    expect(checklist.items.length).toBeGreaterThanOrEqual(6);
  });

  it('finds the numbers the abstract reports, at exact offsets', () => {
    if (!article) throw new Error('no article');
    const candidates = extractNumberCandidates(article.abstract);

    expect(candidates.length).toBeGreaterThan(0);
    for (const kind of expected.numberKinds) {
      expect(candidates.map((candidate) => candidate.kind)).toContain(kind);
    }
    for (const candidate of candidates) {
      expect(article.abstract.slice(candidate.start, candidate.end)).toBe(candidate.raw);
    }
  });

  it('proposes PICO candidates at exact offsets', () => {
    if (!article) throw new Error('no article');
    const candidates = findPicoCandidates(article);

    const fromAbstract = candidates.filter((candidate) => candidate.start >= 0);
    for (const field of expected.picoFromAbstract) {
      expect(fromAbstract.map((candidate) => candidate.field)).toContain(field);
    }
    for (const candidate of fromAbstract) {
      expect(article.abstract.slice(candidate.start, candidate.end)).toBe(candidate.text);
      expect(candidate.text.length).toBeLessThanOrEqual(120);
    }
    // Title candidates carry the documented out-of-band offsets.
    for (const candidate of candidates.filter((c) => c.reason === 'title')) {
      expect(candidate.start).toBe(-1);
      expect(candidate.end).toBe(-1);
    }
  });
});
