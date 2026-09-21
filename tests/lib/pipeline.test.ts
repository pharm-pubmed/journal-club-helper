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
import {
  getChecklist,
  itemsInSection,
  needsMoreThan,
  visibleItems,
} from '../../src/lib/checklist-schema';
import { buildSummaryMarkdown, buildSummaryText } from '../../src/lib/summary-builder';
import { PRODUCT_NAME } from '../../src/ui/labels';
import { classifyDesign } from '../../src/lib/design-classifier';
import { extractNumberCandidates } from '../../src/lib/number-extractor';
import { findPicoCandidates } from '../../src/lib/pico-candidates';
import { extractArticleFromDocument } from '../../src/lib/pubmed-dom';
import type { Appraisal, StudyDesign } from '../../src/lib/types';

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

/**
 * PMID 36577095 as the worked regression case for the critical-appraisal rework.
 *
 * Cao Z, Gao W, Bao H, et al. VV116 versus Nirmatrelvir-Ritonavir for Oral
 * Treatment of Covid-19. N Engl J Med 2023;388:406-417.
 *
 * Chosen because it is the trial where the tempting conclusion is false. It met
 * its non-inferiority criterion for time to sustained clinical recovery
 * (HR 1.17, 95% CI 1.02-1.36, margin 0.8). No participant in either arm died or
 * progressed to severe Covid-19. A summary saying the drug was non-inferior for
 * preventing severe disease or death would therefore be wrong: that outcome had
 * no events and was never put to the test. These tests exist so the export can
 * never quietly stop warning about it.
 */
describe('VV116 (PMID 36577095) end to end', () => {
  const article = extractArticleFromDocument(parse('rct-36577095.html'));

  function classify() {
    if (!article) throw new Error('no article');
    return classifyDesign({
      publicationTypes: article.publicationTypes,
      abstract: article.abstract,
      title: article.title,
    });
  }

  it('is detected as a randomised trial with a non-inferiority subtype', () => {
    const classification = classify();
    expect(classification.design).toBe('rct');
    // The subtype, not a separate design: the general items still apply.
    expect(classification.subtype).toBe('non-inferiority');
    expect(classification.confidence).toBe('high');
  });

  it('adds the non-inferiority checks without replacing the general ones', () => {
    const general = getChecklist('rct', null);
    const withNi = getChecklist('rct', 'non-inferiority');

    expect(general.groups).toBeUndefined();
    expect(withNi.groups?.map((group) => group.id)).toEqual(['rct-non-inferiority']);
    // Every general item survives; the group is additional.
    expect(withNi.items.map((item) => item.id)).toEqual(general.items.map((item) => item.id));
    expect(visibleItems(withNi)).toHaveLength(visibleItems(general).length + 4);
  });

  it('keeps applicability and funding out of the internal-validity items', () => {
    const checklist = getChecklist('rct', 'non-inferiority');
    const internal = itemsInSection(checklist, 'internal-validity');
    const applicability = itemsInSection(checklist, 'applicability');

    expect(internal.length).toBeGreaterThanOrEqual(8);
    expect(applicability).toHaveLength(1);
    // Funding is recorded as fact. It is not an item, so it cannot be scored.
    expect(checklist.info?.id).toBe('funding');
    expect(visibleItems(checklist).some((item) => item.id.includes('funding'))).toBe(false);
  });

  it('marks the questions an abstract cannot settle', () => {
    const checklist = getChecklist('rct', 'non-inferiority');
    const byId = new Map(visibleItems(checklist).map((item) => [item.id, item]));

    const concealment = byId.get('rct-allocation-concealment');
    const prespecification = byId.get('rct-prespecification');
    expect(concealment).toBeDefined();
    expect(prespecification).toBeDefined();
    if (!concealment || !prespecification) return;

    // Reading only the abstract, neither is answerable. That is a limit on the
    // reader, not a fault in the trial, and `needs` is what lets the UI say so.
    expect(needsMoreThan(concealment, 'abstract')).toBe(true);
    expect(needsMoreThan(prespecification, 'abstract')).toBe(true);
    expect(needsMoreThan(prespecification, 'full-text')).toBe(true);
    expect(needsMoreThan(prespecification, 'registry')).toBe(false);
  });

  it('exports the non-inferiority caution and never widens the claim', () => {
    if (!article) throw new Error('no article');
    const { title, authors, journal, year, doi } = article;
    const appraisal: Appraisal = {
      schemaVersion: 2,
      pmid: article.pmid,
      createdAt: 0,
      updatedAt: 0,
      citation: { title, authors, journal, year, doi },
      designDetected: classify(),
      designOverride: null,
      subtypeOverride: null,
      pico: { p: '', i: '', c: '', o: '' },
      numbers: null,
      validity: {
        rct: {
          // The primary analysis was 771 of 822 randomised who received at least
          // one dose: a full analysis set, not strict ITT. The label is not the
          // verdict, so this is recorded as what was actually done.
          'rct-analysis-population': {
            verdict: 'unclear',
            note: '771 of 822 randomised were analysed, so this is a full analysis set rather than strict intention to treat.',
            source: 'full-text',
          },
          // "Observer-blinded" does not settle a symptom-based endpoint.
          'rct-outcome-measurement': { verdict: 'unclear', note: '', source: null },
        },
      },
      sourceScope: 'abstract',
      info: { funder: 'Vigonvita Life Sciences and others' },
      bottomLine: '',
      discussionQuestions: [],
    };

    const md = buildSummaryMarkdown(appraisal, { productName: PRODUCT_NAME });
    const text = buildSummaryText(appraisal, { productName: PRODUCT_NAME });

    for (const rendering of [md, text]) {
      // The subtype reads as its own fact, not as a different design.
      expect(rendering).toContain('Non-inferiority design');
      // The guardrail this paper exists to protect.
      expect(rendering).toContain('Carry this result no further than the outcome it was tested on');
      expect(rendering).toContain('no events in either arm');
      // Applicability is visibly not a verdict on how the trial was run.
      expect(rendering).toContain('Applicability is not internal validity');
      // Funding recorded, sponsor role absent — and absence must not read as a finding.
      expect(rendering).toContain('Vigonvita Life Sciences');
      expect(rendering).toContain('Recorded as fact, never scored');
      // Nothing generates a conclusion, so the false claim cannot appear on its own.
      expect(rendering).not.toMatch(/non-?inferior[a-z]* (?:for|in) preventing/i);
      expect(rendering).not.toContain('severe Covid-19 or death');
    }
  });
});
