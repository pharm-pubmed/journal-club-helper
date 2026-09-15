import { describe, expect, it } from 'vitest';
import { parsePmidFromUrl } from '../../src/lib/pubmed-url';

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
