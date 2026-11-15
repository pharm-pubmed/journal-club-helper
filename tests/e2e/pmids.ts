import type { StudyDesign } from '../../src/lib/types';

/**
 * The records the smoke run opens (#24). Each has a saved page in
 * tests/fixtures/pubmed/, which is what CI serves at the record's real URL.
 *
 * The expected values are what the record says, so the live run can fail
 * because NLM legitimately edited a record (a publication type added, say), not
 * only because the markup changed. Read the diff before assuming either.
 */
export interface SmokeRecord {
  pmid: string;
  fixture: string;
  doi: string;
  design: StudyDesign;
  journal: string;
  year: string;
  /**
   * Every form the page's citation meta has given it. The form follows the
   * dialect, and the live page has switched dialect under a saved fixture
   * before (36577095 and 34844936 went from `citation_author` "Zhujun Cao" to
   * `citation_authors` "Cao Z" by 2026-11), so either reading is accepted.
   */
  firstAuthor: readonly string[];
}

/**
 * VV116 versus nirmatrelvir-ritonavir, NEJM 2023. The regression case
 * everywhere else (HANDOVER §7), NLM citation-meta dialect in the saved fixture, and its abstract
 * reports event rates as a `vs` percent pair, which the NNT scenario needs.
 */
export const RCT: SmokeRecord = {
  pmid: '36577095',
  fixture: 'rct-36577095.html',
  doi: '10.1056/NEJMoa2208822',
  design: 'rct',
  journal: 'N Engl J Med',
  year: '2023',
  firstAuthor: ['Zhujun Cao', 'Cao Z'],
};

/** The percent pair in the RCT's abstract, and the NNT the panel computes from it. */
export const RCT_PERCENT_PAIR = { raw: '67.4% vs. 77.3%', nnt: 'NNT 11' };

/**
 * BMJ meta-analysis. The publisher-supplied citation-meta dialect (one
 * semicolon-separated `citation_authors`, `citation_date`, no journal
 * abbreviation), so the journal comes from `#full-view-journal-trigger`, which
 * no other saved page has (HANDOVER §5, points 2 and 3).
 */
export const META_ANALYSIS: SmokeRecord = {
  pmid: '36740866',
  fixture: 'meta-analysis-36740866.html',
  doi: '10.1136/bmj-2022-071966',
  design: 'sr-ma',
  journal: 'BMJ',
  year: '2022',
  firstAuthor: ['Weatherald J'],
};

/** BMJ cohort, NLM dialect in the saved fixture: an observational design alongside the two above. */
export const COHORT: SmokeRecord = {
  pmid: '34844936',
  fixture: 'cohort-34844936.html',
  doi: '10.1136/bmj-2021-066306',
  design: 'cohort',
  journal: 'BMJ',
  year: '2021',
  firstAuthor: ['Edouard L Fu', 'Fu EL'],
};

export const RECORDS: readonly SmokeRecord[] = [RCT, META_ANALYSIS, COHORT];

export const articleUrl = (record: SmokeRecord): string =>
  `https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`;

/** A search results page: the content script must leave it alone. */
export const SEARCH_URL = 'https://pubmed.ncbi.nlm.nih.gov/?term=VV116';
