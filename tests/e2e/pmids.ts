import type { StudyDesign } from '../../src/lib/types';

/**
 * The records the smoke run opens (#24). Each has a saved page in
 * tests/fixtures/pubmed/, which is what CI serves at the record's real URL, so
 * the fixture run and the live run check exactly the same expectations.
 */
export interface SmokeRecord {
  pmid: string;
  fixture: string;
  doi: string;
  design: StudyDesign;
}

/**
 * VV116 versus nirmatrelvir-ritonavir, NEJM 2023. Chosen because it is the
 * regression case everywhere else (HANDOVER §7), carries the NLM citation-meta
 * dialect, and its abstract reports event rates as a `vs` percent pair
 * ("67.4% vs. 77.3%"), which is what the NNT scenario needs.
 */
export const RCT: SmokeRecord = {
  pmid: '36577095',
  fixture: 'rct-36577095.html',
  doi: '10.1056/NEJMoa2208822',
  design: 'rct',
};

/**
 * BMJ meta-analysis. The only saved page with `#full-view-journal-trigger`, so
 * it exercises the other journal-name path (HANDOVER §5, point 2).
 */
export const META_ANALYSIS: SmokeRecord = {
  pmid: '36740866',
  fixture: 'meta-analysis-36740866.html',
  doi: '10.1136/bmj-2022-071966',
  design: 'sr-ma',
};

/**
 * BMJ cohort. Publisher-supplied citation meta (`citation_authors`,
 * `citation_date`, no journal abbreviation), the dialect most likely to drift
 * independently of the NLM one.
 */
export const COHORT: SmokeRecord = {
  pmid: '34844936',
  fixture: 'cohort-34844936.html',
  doi: '10.1136/bmj-2021-066306',
  design: 'cohort',
};

export const RECORDS: readonly SmokeRecord[] = [RCT, META_ANALYSIS, COHORT];

export const articleUrl = (record: SmokeRecord): string =>
  `https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`;

/** A search results page: the content script must leave it alone. */
export const SEARCH_URL = 'https://pubmed.ncbi.nlm.nih.gov/?term=VV116';
