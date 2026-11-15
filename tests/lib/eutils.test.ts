// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true } }
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classifyDesign } from '../../src/lib/design-classifier';
import {
  EUTILS_CONTACT,
  EutilsError,
  createRateLimiter,
  efetchUrl,
  fetchArticleFromEutils,
  parseEfetchDocument,
} from '../../src/lib/eutils';
import { extractArticleFromDocument } from '../../src/lib/pubmed-dom';

function xml(pmid: string): string {
  return readFileSync(resolve(__dirname, `../fixtures/eutils/${pmid}.xml`), 'utf8');
}

function parse(source: string): Document {
  return new DOMParser().parseFromString(source, 'application/xml');
}

function page(file: string, pmid: string) {
  const html = readFileSync(resolve(__dirname, `../fixtures/pubmed/${file}`), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractArticleFromDocument(doc, `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);
}

describe('parseEfetchDocument', () => {
  it('reads a structured abstract with its labelled sections', () => {
    const article = parseEfetchDocument(parse(xml('36577095')), '36577095')!;
    expect(article.source).toBe('eutils');
    expect(article.title).toBe(
      'VV116 versus Nirmatrelvir-Ritonavir for Oral Treatment of Covid-19',
    );
    expect(article.abstractSections.map((s) => s.label)).toEqual([
      'BACKGROUND',
      'METHODS',
      'RESULTS',
      'CONCLUSIONS',
    ]);
    expect(article.abstract).toBe(article.abstractSections.map((s) => s.text).join('\n\n'));
    expect(article.abstract).toContain('67.4% vs. 77.3%');
    expect(article.doi).toBe('10.1056/NEJMoa2208822');
    expect(article.journal).toBe('N Engl J Med');
    expect(article.year).toBe('2023');
    expect(article.authors[0]).toBe('Zhujun Cao');
    expect(article.publicationTypes).toContain('Randomized Controlled Trial');
    expect(article.meshTerms).toContain('COVID-19');
  });

  it('leaves the copyright line out of the abstract', () => {
    const article = parseEfetchDocument(parse(xml('36577095')), '36577095')!;
    expect(article.abstract).not.toMatch(/copyright|©/i);
  });

  it('reads an unstructured abstract, a record with no DOI and one with no author list', () => {
    const article = parseEfetchDocument(parse(xml('2899772')), '2899772')!;
    expect(article.abstractSections).toEqual([]);
    expect(article.abstract).toContain('17,187 patients');
    expect(article.doi).toBeNull();
    expect(article.authors).toEqual([]);
    expect(article.journal).toBe('Lancet');
    expect(article.year).toBe('1988');
  });

  it('takes the record’s own DOI, not one from its reference list', () => {
    const article = parseEfetchDocument(parse(xml('34844936')), '34844936')!;
    expect(article.doi).toBe('10.1136/bmj-2021-066306');
    expect(article.authors[0]).toBe('Edouard L Fu');
  });

  it('finds no DOI for a record without one, even when its references have them', () => {
    const withReferences = xml('2899772').replace(
      '</PubmedData>',
      '<ReferenceList><Reference><Citation>Other paper.</Citation><ArticleIdList>' +
        '<ArticleId IdType="doi">10.1000/not-this-one</ArticleId></ArticleIdList></Reference>' +
        '</ReferenceList></PubmedData>',
    );
    expect(withReferences).toContain('10.1000/not-this-one');
    expect(parseEfetchDocument(parse(withReferences), '2899772')!.doi).toBeNull();
  });

  it('names a group author as written, skips an invalid name, and falls back to initials', () => {
    const authors =
      '<AuthorList CompleteYN="Y">' +
      '<Author ValidYN="Y"><LastName>Smith</LastName><ForeName>John</ForeName><Initials>J</Initials></Author>' +
      '<Author ValidYN="N"><LastName>Smiht</LastName><ForeName>John</ForeName></Author>' +
      '<Author ValidYN="Y"><LastName>Doe</LastName><Initials>JA</Initials></Author>' +
      '<Author ValidYN="Y"><CollectiveName>ISIS-2 Collaborative Group</CollectiveName></Author>' +
      '</AuthorList>';
    const edited = xml('2899772').replace('<Language>', `${authors}<Language>`);
    expect(edited).toContain('Smiht');
    expect(parseEfetchDocument(parse(edited), '2899772')!.authors).toEqual([
      'John Smith',
      'JA Doe',
      'ISIS-2 Collaborative Group',
    ]);
  });

  it('folds an unlabelled paragraph into the section above it, as the page does', () => {
    const partial = xml('2899772').replace(
      /<Abstract>[\s\S]*?<\/Abstract>/,
      '<Abstract><AbstractText Label="BACKGROUND">B.</AbstractText><AbstractText>Trailing.</AbstractText></Abstract>',
    );
    const article = parseEfetchDocument(parse(partial), '2899772')!;
    expect(article.abstractSections).toEqual([{ label: 'BACKGROUND', text: 'B.\n\nTrailing.' }]);
    expect(article.abstract).toBe('B.\n\nTrailing.');
  });

  it.each([
    ['rct-36577095.html', '36577095'],
    ['cohort-34844936.html', '34844936'],
  ])('classifies %s the same from either source', (file, pmid) => {
    const fromPage = classifyDesign(page(file, pmid)!);
    const fromXml = classifyDesign(parseEfetchDocument(parse(xml(pmid)), pmid)!);
    expect(fromXml.design).toBe(fromPage.design);
    expect(fromXml.subtype).toBe(fromPage.subtype);
  });

  it('classifies the unstructured ISIS-2 record as a trial', () => {
    const article = parseEfetchDocument(parse(xml('2899772')), '2899772')!;
    expect(classifyDesign(article).design).toBe('rct');
  });

  it.each([
    ['rct-36577095.html', '36577095'],
    ['cohort-34844936.html', '34844936'],
  ])('agrees with the page extractor on %s', (file, pmid) => {
    const fromPage = page(file, pmid)!;
    const fromXml = parseEfetchDocument(parse(xml(pmid)), pmid)!;
    expect(fromXml.title).toBe(fromPage.title);
    expect(fromXml.abstract).toBe(fromPage.abstract);
    expect(fromXml.abstractSections).toEqual(fromPage.abstractSections);
    expect(fromXml.doi).toBe(fromPage.doi);
    expect(fromXml.journal).toBe(fromPage.journal);
    expect(fromXml.year).toBe(fromPage.year);
    expect(fromXml.authors).toEqual(fromPage.authors);
  });

  it('returns null for a PMID the set does not hold, and for a record without an abstract', () => {
    expect(parseEfetchDocument(parse(xml('2899772')), '1')).toBeNull();
    const noAbstract = xml('2899772').replace(/<Abstract>[\s\S]*?<\/Abstract>/, '');
    expect(parseEfetchDocument(parse(noAbstract), '2899772')).toBeNull();
  });

  it('falls back to MedlineDate for the year', () => {
    const odd = xml('2899772').replace(
      /<PubDate>[\s\S]*?<\/PubDate>/,
      '<PubDate><MedlineDate>1998 Dec-1999 Jan</MedlineDate></PubDate>',
    );
    expect(parseEfetchDocument(parse(odd), '2899772')!.year).toBe('1998');
  });
});

describe('efetchUrl', () => {
  it('names the tool and leaves out an empty contact address', () => {
    const url = new URL(efetchUrl('2899772', { tool: 'journal-club-helper', email: '' }));
    expect(url.origin + url.pathname).toBe(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      db: 'pubmed',
      id: '2899772',
      retmode: 'xml',
      tool: 'journal-club-helper',
    });
  });

  it('sends the contact address once there is one', () => {
    const url = new URL(efetchUrl('1', { tool: 't', email: 'team@example.org' }));
    expect(url.searchParams.get('email')).toBe('team@example.org');
  });

  it('ships with the project mailbox, not a personal address (#30)', () => {
    expect(EUTILS_CONTACT).toEqual({
      tool: 'journal-club-helper',
      email: 'journal.club.helper@gmail.com',
    });
  });
});

describe('fetchArticleFromEutils', () => {
  const noWait = async () => undefined;

  function deps(response: Response | Error) {
    const fetch = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    return {
      fetch: fetch as unknown as typeof globalThis.fetch,
      parse,
      rateLimit: noWait,
      mock: fetch,
    };
  }

  async function failure(promise: Promise<unknown>): Promise<EutilsError> {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(EutilsError);
      return error as EutilsError;
    }
    throw new Error('expected the fetch to fail');
  }

  it('returns the article for a good answer', async () => {
    const d = deps(new Response(xml('36577095'), { status: 200 }));
    const article = await fetchArticleFromEutils('36577095', EUTILS_CONTACT, d);
    expect(article.pmid).toBe('36577095');
    expect(d.mock).toHaveBeenCalledWith(efetchUrl('36577095', EUTILS_CONTACT), {
      signal: expect.any(AbortSignal),
    });
  });

  it('waits for the rate limiter before every request', async () => {
    const order: string[] = [];
    const d = deps(new Response(xml('2899772'), { status: 200 }));
    d.mock.mockImplementation(async () => {
      order.push('fetch');
      return new Response(xml('2899772'), { status: 200 });
    });
    await fetchArticleFromEutils('2899772', EUTILS_CONTACT, {
      ...d,
      rateLimit: async () => {
        order.push('token');
      },
    });
    expect(order).toEqual(['token', 'fetch']);
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch'), 'network'],
    ['HTTP 429', new Response('', { status: 429 }), 'rate-limit'],
    ['HTTP 500', new Response('', { status: 500 }), 'http'],
    ['malformed XML', new Response('<PubmedArticleSet><oops', { status: 200 }), 'http'],
    [
      'an empty set',
      new Response('<PubmedArticleSet></PubmedArticleSet>', { status: 200 }),
      'not-found',
    ],
    [
      'a record without an abstract',
      new Response(xml('2899772').replace(/<Abstract>[\s\S]*?<\/Abstract>/, ''), { status: 200 }),
      'no-abstract',
    ],
  ] as const)('reports %s as %s', async (_name, response, kind) => {
    const error = await failure(fetchArticleFromEutils('2899772', EUTILS_CONTACT, deps(response)));
    expect(error.kind).toBe(kind);
  });

  it('reports a book record as a book, not as a missing record', async () => {
    const book =
      '<PubmedArticleSet><PubmedBookArticle><BookDocument><PMID Version="1">20301295</PMID>' +
      '</BookDocument></PubmedBookArticle></PubmedArticleSet>';
    const d = deps(new Response(book, { status: 200 }));
    const error = await failure(fetchArticleFromEutils('20301295', EUTILS_CONTACT, d));
    expect(error.kind).toBe('book');
  });

  it('reports a body cut off mid-read as a network failure', async () => {
    const response = new Response('x', { status: 200 });
    response.text = async () => {
      throw new TypeError('network error');
    };
    const error = await failure(fetchArticleFromEutils('2899772', EUTILS_CONTACT, deps(response)));
    expect(error.kind).toBe('network');
  });

  it('gives up after its timeout and says so', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const error = await failure(
      fetchArticleFromEutils('2899772', EUTILS_CONTACT, {
        fetch: hang as unknown as typeof globalThis.fetch,
        parse,
        rateLimit: noWait,
        timeoutMs: 20,
      }),
    );
    expect(error.kind).toBe('timeout');
  });

  it('reports a set that holds another record as not found', async () => {
    const d = deps(new Response(xml('2899772'), { status: 200 }));
    expect((await failure(fetchArticleFromEutils('1', EUTILS_CONTACT, d))).kind).toBe('not-found');
  });

  it('refuses something that is not a PMID without a request', async () => {
    const d = deps(new Response(xml('2899772'), { status: 200 }));
    const error = await failure(fetchArticleFromEutils('12&db=x', EUTILS_CONTACT, d));
    expect(error.kind).toBe('not-found');
    expect(d.mock).not.toHaveBeenCalled();
  });
});

describe('createRateLimiter', () => {
  function fakeClock() {
    let now = 0;
    const sleeps: number[] = [];
    return {
      now: () => now,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        now += ms;
      },
      advance: (ms: number) => {
        now += ms;
      },
      sleeps,
    };
  }

  it('lets three through at once and holds the fourth until the second is up', async () => {
    const clock = fakeClock();
    const take = createRateLimiter(3, clock);
    await Promise.all([take(), take(), take()]);
    expect(clock.sleeps).toEqual([]);
    await take();
    expect(clock.sleeps).toEqual([1000]);
  });

  it('never allows more than three in any one-second window', async () => {
    const clock = fakeClock();
    const take = createRateLimiter(3, clock);
    const times: number[] = [];
    for (let n = 0; n < 12; n++) {
      await take();
      times.push(clock.now());
    }
    for (let i = 3; i < times.length; i++) {
      expect(times[i]! - times[i - 3]!).toBeGreaterThanOrEqual(1000);
    }
  });

  it('never waits more than a second, even when the clock goes backwards', async () => {
    const clock = fakeClock();
    const take = createRateLimiter(3, clock);
    await Promise.all([take(), take(), take()]);
    clock.advance(-60_000);
    await take();
    expect(clock.sleeps).toEqual([1000]);
  });

  it('refills while idle', async () => {
    const clock = fakeClock();
    const take = createRateLimiter(3, clock);
    await Promise.all([take(), take(), take()]);
    clock.advance(1000);
    await Promise.all([take(), take(), take()]);
    expect(clock.sleeps).toEqual([]);
  });
});
