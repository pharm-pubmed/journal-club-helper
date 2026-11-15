/**
 * NCBI E-utilities fallback for when the page cannot be read (issue #23, spec §4.1).
 *
 * PubMed's markup can change without notice. When `extractArticleFromDocument`
 * returns null on an abstract page, the panel offers to fetch the same record
 * from `efetch` instead, and only after the user has granted the optional host
 * permission. Nothing here runs unless the user asks for it.
 *
 * NCBI's rules for callers without an API key: at most 3 requests a second, and
 * identify the tool and a contact address. A page context cannot set
 * User-Agent, so both go in the query string as `tool` and `email`. The contact
 * address is the project mailbox from #30, which does not exist yet. Until it
 * does, `email` is left out rather than filled with a placeholder NCBI might
 * try to write to, or with anyone's personal address.
 *
 * The XML is read with `DOMParser` into the same `PubMedArticle` shape the page
 * extractor produces. The abstract, its sections, the DOI, the journal, the
 * year, the authors and the title match what the page gives for the same
 * record. Publication types and MeSH terms do not match exactly: the XML lists
 * "Journal Article" and bare descriptors where the page shows qualifiers. The
 * design classifier reads the same answer from both.
 *
 * `fetch` and `DOMParser` are supplied by the tests. The rate limiter is module
 * state, one per panel document.
 */
import type { AbstractSection, PubMedArticle } from './types';

/** A match pattern, as `chrome.permissions` takes it. */
export const EUTILS_ORIGIN = 'https://eutils.ncbi.nlm.nih.gov/*';
export const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

export interface EutilsContact {
  tool: string;
  /** The project's mailbox (#30), never a user's. An empty address is not sent. */
  email: string;
}

export const EUTILS_CONTACT: EutilsContact = {
  tool: 'journal-club-helper',
  email: 'journal.club.helper@gmail.com',
};

export type EutilsErrorKind =
  'network' | 'timeout' | 'http' | 'rate-limit' | 'not-found' | 'no-abstract' | 'book';

/** NCBI normally answers in well under a second. */
export const EFETCH_TIMEOUT_MS = 20_000;

export class EutilsError extends Error {
  readonly kind: EutilsErrorKind;

  constructor(kind: EutilsErrorKind, message: string) {
    super(message);
    this.name = 'EutilsError';
    this.kind = kind;
  }
}

/* ------------------------------------------------------------ rate limiting */

/**
 * At most `perSecond` requests in any one-second window. A token bucket would
 * be the usual choice, but a full bucket lets a fourth request through a third
 * of a second after a burst of three, which is four inside one second. Requests
 * only follow a click, so the limit is rarely reached. It is per panel
 * document: two windows with a panel each could in principle send six.
 */
export function createRateLimiter(
  perSecond: number,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
): () => Promise<void> {
  const recent: number[] = [];
  // Callers queue behind one another, so two cannot take the last slot together.
  let queue: Promise<void> = Promise.resolve();
  return () => {
    const turn = queue.then(async () => {
      if (recent.length >= perSecond) {
        // Never more than a second: a clock set backwards must not stall the panel.
        const wait = Math.min(1000, recent[0]! + 1000 - clock.now());
        if (wait > 0) await clock.sleep(wait);
        recent.shift();
      }
      recent.push(clock.now());
    });
    queue = turn.catch(() => undefined);
    return turn;
  };
}

const takeSlot = createRateLimiter(3);

/* ------------------------------------------------------------------ parsing */

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Direct children by tag name; `querySelector` would also match inside references. */
function child(parent: Element | null | undefined, tag: string): Element | null {
  if (!parent) return null;
  for (const element of Array.from(parent.children)) {
    if (element.tagName === tag) return element;
  }
  return null;
}

function children(parent: Element | null | undefined, tag: string): Element[] {
  if (!parent) return [];
  return Array.from(parent.children).filter((element) => element.tagName === tag);
}

function path(root: Element | null, ...tags: string[]): Element | null {
  let node = root;
  for (const tag of tags) node = child(node, tag);
  return node;
}

function readAbstract(article: Element | null): {
  abstract: string;
  abstractSections: AbstractSection[];
} {
  // Only <AbstractText>: <CopyrightInformation> sits beside it and is not abstract.
  const parts = children(child(article, 'Abstract'), 'AbstractText')
    .map((element) => ({
      label: (element.getAttribute('Label') ?? '').trim().toUpperCase(),
      text: text(element),
    }))
    .filter((part) => part.text.length > 0);
  const structured = parts.some((part) => part.label.length > 0);
  // As on the page: an unlabelled paragraph belongs to the section above it.
  const sections: AbstractSection[] = [];
  for (const part of parts) {
    const previous = sections[sections.length - 1];
    if (part.label === '' && previous) previous.text = `${previous.text}\n\n${part.text}`;
    else sections.push({ ...part });
  }
  return {
    abstract: parts.map((part) => part.text).join('\n\n'),
    abstractSections: structured ? sections : [],
  };
}

/**
 * "ForeName LastName", as the page's citation meta gives it; a group name as is.
 * An author NCBI marks `ValidYN="N"` is a known misspelling kept for indexing,
 * not a person on the byline.
 */
function readAuthors(article: Element | null): string[] {
  return children(child(article, 'AuthorList'), 'Author')
    .filter((author) => author.getAttribute('ValidYN') !== 'N')
    .map((author) => {
      const collective = text(child(author, 'CollectiveName'));
      if (collective) return collective;
      const given = text(child(author, 'ForeName')) || text(child(author, 'Initials'));
      return [given, text(child(author, 'LastName'))].filter((part) => part.length > 0).join(' ');
    })
    .filter((name) => name.length > 0);
}

function readYear(journal: Element | null): string {
  const pubDate = path(journal, 'JournalIssue', 'PubDate');
  const year = text(child(pubDate, 'Year'));
  if (year) return year;
  // Older records carry only a free-text <MedlineDate>, e.g. "1998 Dec-1999 Jan".
  return /(?:19|20)\d{2}/.exec(text(child(pubDate, 'MedlineDate')))?.[0] ?? '';
}

function readDoi(record: Element, article: Element | null): string | null {
  // PubmedData/ArticleIdList is the record's own; ReferenceList holds other papers' DOIs.
  const fromIds = children(path(record, 'PubmedData', 'ArticleIdList'), 'ArticleId').find(
    (element) => element.getAttribute('IdType') === 'doi',
  );
  const fromLocation = children(article, 'ELocationID').find(
    (element) => element.getAttribute('EIdType') === 'doi',
  );
  return text(fromIds) || text(fromLocation) || null;
}

/**
 * Builds a `PubMedArticle` from an efetch `PubmedArticleSet` document.
 *
 * Returns null when the set holds no record for `pmid`, or the record has no
 * abstract: there is nothing to appraise, exactly as with the page extractor.
 */
export function parseEfetchDocument(doc: Document, pmid: string): PubMedArticle | null {
  const record = Array.from(doc.getElementsByTagName('PubmedArticle')).find(
    (candidate) => text(path(candidate, 'MedlineCitation', 'PMID')) === pmid,
  );
  if (!record) return null;

  const citation = child(record, 'MedlineCitation');
  const article = child(citation, 'Article');
  const journal = child(article, 'Journal');
  const { abstract, abstractSections } = readAbstract(article);
  if (!abstract) return null;

  return {
    pmid,
    // MEDLINE ends every title with a period, which the page's citation meta drops.
    title: text(child(article, 'ArticleTitle')).replace(/\.$/, ''),
    abstract,
    abstractSections,
    publicationTypes: children(child(article, 'PublicationTypeList'), 'PublicationType')
      .map((element) => text(element))
      .filter((value) => value.length > 0),
    meshTerms: children(child(citation, 'MeshHeadingList'), 'MeshHeading')
      .map((heading) => text(child(heading, 'DescriptorName')))
      .filter((value) => value.length > 0),
    authors: readAuthors(article),
    journal:
      text(child(journal, 'ISOAbbreviation')) ||
      text(path(citation, 'MedlineJournalInfo', 'MedlineTA')) ||
      text(child(journal, 'Title')),
    year: readYear(journal),
    doi: readDoi(record, article),
    source: 'eutils',
  };
}

/* ------------------------------------------------------------------- fetch */

export function efetchUrl(pmid: string, contact: EutilsContact): string {
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmid,
    retmode: 'xml',
    tool: contact.tool,
  });
  if (contact.email) params.set('email', contact.email);
  return `${EFETCH_URL}?${params.toString()}`;
}

export interface EutilsDeps {
  fetch?: typeof fetch;
  parse?: (xml: string) => Document;
  /** Awaited before each request; the module-level 3-a-second limiter by default. */
  rateLimit?: () => Promise<void>;
  timeoutMs?: number;
}

export async function fetchArticleFromEutils(
  pmid: string,
  contact: EutilsContact = EUTILS_CONTACT,
  deps: EutilsDeps = {},
): Promise<PubMedArticle> {
  if (!/^\d+$/.test(pmid)) throw new EutilsError('not-found', `"${pmid}" is not a PMID.`);
  const fetchImpl = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const parse =
    deps.parse ?? ((xml: string) => new DOMParser().parseFromString(xml, 'application/xml'));

  await (deps.rateLimit ?? takeSlot)();

  let response: Response;
  try {
    response = await fetchImpl(efetchUrl(pmid, contact), {
      signal: AbortSignal.timeout(deps.timeoutMs ?? EFETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new EutilsError('timeout', 'NCBI did not answer in time. Try again in a moment.');
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new EutilsError('network', `Could not reach NCBI: ${detail}`);
  }
  if (response.status === 429) {
    throw new EutilsError('rate-limit', 'NCBI asked us to slow down. Try again in a few seconds.');
  }
  if (!response.ok) {
    throw new EutilsError('http', `NCBI answered with HTTP ${response.status}.`);
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EutilsError('network', `The answer from NCBI was cut off: ${detail}`);
  }
  let doc: Document;
  try {
    doc = parse(body);
  } catch {
    throw new EutilsError('http', 'NCBI sent something that is not XML.');
  }
  // DOMParser reports malformed XML as a document, not an exception.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new EutilsError('http', 'NCBI sent something that is not XML.');
  }
  const held = Array.from(doc.getElementsByTagName('PubmedArticle')).some(
    (record) => text(path(record, 'MedlineCitation', 'PMID')) === pmid,
  );
  if (!held) {
    const book = Array.from(doc.getElementsByTagName('PubmedBookArticle')).some(
      (record) => text(path(record, 'BookDocument', 'PMID')) === pmid,
    );
    if (book) {
      throw new EutilsError(
        'book',
        `PubMed record ${pmid} is a book or book chapter, which the panel cannot appraise.`,
      );
    }
    throw new EutilsError('not-found', `NCBI has no PubMed record ${pmid}.`);
  }
  const article = parseEfetchDocument(doc, pmid);
  if (!article) throw new EutilsError('no-abstract', `PubMed record ${pmid} has no abstract.`);
  return article;
}
