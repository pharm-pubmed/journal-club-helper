import { describe, expect, it } from 'vitest';
import { isPubMedUrl, parsePmidFromUrl } from '../../src/lib/pubmed-url';

describe('parsePmidFromUrl', () => {
  it('reads the PMID from a canonical abstract URL', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095/')).toBe('36577095');
  });

  it('accepts an abstract URL without the trailing slash', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095')).toBe('36577095');
  });

  it('ignores the query string', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095/?format=pubmed')).toBe(
      '36577095',
    );
  });

  it('ignores the hash', () => {
    expect(
      parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095/#full-view-identifiers'),
    ).toBe('36577095');
  });

  it('ignores query and hash together', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095?a=1#b')).toBe('36577095');
  });

  it('rejects the search results page', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/?term=statins')).toBeNull();
  });

  it('rejects the site root', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/')).toBeNull();
  });

  it('rejects the advanced search page', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/advanced/')).toBeNull();
  });

  it('rejects sub-pages of an article', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095/similar/')).toBeNull();
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095/citedby/')).toBeNull();
  });

  it('rejects other hosts, including subdomains and the legacy path', () => {
    expect(parsePmidFromUrl('https://example.com/36577095/')).toBeNull();
    expect(parsePmidFromUrl('https://www.pubmed.ncbi.nlm.nih.gov/36577095/')).toBeNull();
    expect(parsePmidFromUrl('https://www.ncbi.nlm.nih.gov/pubmed/36577095')).toBeNull();
  });

  it('rejects a non-numeric path', () => {
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/36577095a/')).toBeNull();
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/clinical/')).toBeNull();
  });

  it('rejects strings that are not absolute URLs', () => {
    expect(parsePmidFromUrl('/36577095/')).toBeNull();
    expect(parsePmidFromUrl('')).toBeNull();
    expect(parsePmidFromUrl('not a url')).toBeNull();
  });
});

describe('isPubMedUrl', () => {
  it('accepts an abstract page', () => {
    expect(isPubMedUrl('https://pubmed.ncbi.nlm.nih.gov/36577095/')).toBe(true);
  });

  it('accepts the search results page the abstract matcher rejects', () => {
    // The panel is scoped to the host, not the page, so it survives the trip
    // back to the result list between two articles (#43).
    expect(isPubMedUrl('https://pubmed.ncbi.nlm.nih.gov/?term=statins')).toBe(true);
    expect(parsePmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/?term=statins')).toBeNull();
  });

  it('rejects another site', () => {
    expect(isPubMedUrl('https://example.com/')).toBe(false);
  });

  it('rejects a lookalike host', () => {
    expect(isPubMedUrl('https://pubmed.ncbi.nlm.nih.gov.evil.test/36577095/')).toBe(false);
  });

  it('rejects a url the browser withheld', () => {
    expect(isPubMedUrl(undefined)).toBe(false);
    expect(isPubMedUrl('')).toBe(false);
  });

  it('rejects a browser page', () => {
    expect(isPubMedUrl('chrome://extensions/')).toBe(false);
    expect(isPubMedUrl('about:blank')).toBe(false);
  });
});
