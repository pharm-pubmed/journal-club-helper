/**
 * PubMed URL matching (issue #4, spec §4.1).
 *
 * Only the abstract page `https://pubmed.ncbi.nlm.nih.gov/<PMID>/` counts.
 * Search results, the advanced builder and article sub-pages must not match.
 */

const PUBMED_HOST = 'pubmed.ncbi.nlm.nih.gov';

/** The whole path has to be the PMID; a trailing slash is optional. */
const ABSTRACT_PATH = /^\/(\d+)\/?$/;

/**
 * Returns the PMID of a PubMed abstract page, or null for every other URL.
 * Query strings and hashes are ignored (#1 B7).
 */
export function parsePmidFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== PUBMED_HOST) return null;
  return ABSTRACT_PATH.exec(parsed.pathname)?.[1] ?? null;
}

/**
 * True for any page on the PubMed host, abstract or not (#43).
 *
 * Used to scope the side panel and the toolbar icon to tabs where the extension
 * has something to do. Deliberately wider than `parsePmidFromUrl`: the panel
 * only ever reads an abstract, but a reader works through a result list one
 * article at a time, and closing the panel on every trip back to that list
 * would mean reopening it for each one.
 *
 * `url` is optional because that is how it arrives. Without the `tabs`
 * permission `Tab.url` is populated only for hosts we hold a permission for, so
 * an absent url already means "not PubMed" — see the note in background.ts.
 */
export function isPubMedUrl(url: string | undefined): boolean {
  if (url === undefined || url === '') return false;
  try {
    return new URL(url).hostname === PUBMED_HOST;
  } catch {
    return false;
  }
}
