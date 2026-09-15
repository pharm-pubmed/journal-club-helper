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
