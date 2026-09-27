// @vitest-environment happy-dom
/**
 * The E-utilities fallback as the panel drives it (#23): offered only when an
 * abstract page cannot be read, fetched only after the permission is granted,
 * and kept across a switch back to the tab.
 *
 * `chrome.*` and `fetch` are fakes; the hook, the store and `src/lib/eutils.ts`
 * are the real ones.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EUTILS_ORIGIN } from '../../src/lib/eutils';
import type { PubMedArticle } from '../../src/lib/types';
import { useArticle, type UseArticle } from '../../src/ui/hooks/useArticle';
import { actions, initialState, store } from '../../src/ui/store';

const PMID = '2899772';
const OTHER_PMID = '36577095';
const url = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
const XML = readFileSync(resolve(__dirname, `../fixtures/eutils/${PMID}.xml`), 'utf8');
const WINDOW = 1;

const PAGE_ARTICLE: PubMedArticle = {
  pmid: PMID,
  title: 't',
  abstract: 'a',
  abstractSections: [],
  publicationTypes: [],
  meshTerms: [],
  authors: [],
  journal: '',
  year: '',
  doi: null,
  source: 'dom',
};

type Activated = (info: { tabId: number; windowId: number }) => void;
type Updated = (
  id: number,
  change: { status?: string },
  tab: { active: boolean; windowId: number },
) => void;

let api: UseArticle;
let pageAnswer: PubMedArticle | null;
let tabUrl: string;
let listeners: { activated: Activated[]; updated: Updated[] };
/** Resolves the pending permission prompt. */
let answerPrompt: (granted: boolean) => void;
const fetchMock = vi.fn(async () => new Response(XML, { status: 200 }));
const requestMock = vi.fn(
  () =>
    new Promise<boolean>((resolvePrompt) => {
      answerPrompt = resolvePrompt;
    }),
);
const queryMock = vi.fn(async () => [{ id: 7, url: tabUrl, active: true, windowId: WINDOW }]);

function Probe() {
  api = useArticle();
  return null;
}

/**
 * Runs everything pending to completion. Timers are fake because the NCBI rate
 * limiter is module-level and real: without this, the fourth fetch in this file
 * would wait a real second and land after the test had moved on.
 */
async function settle(): Promise<void> {
  for (let n = 0; n < 10; n++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  store.resetForArticle(null);
  store.set({ ...initialState() });
  pageAnswer = null;
  tabUrl = url(PMID);
  listeners = { activated: [], updated: [] };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(XML, { status: 200 }));
  requestMock.mockClear();
  queryMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', {
    tabs: {
      query: queryMock,
      sendMessage: async () => ({ article: pageAnswer }),
      onActivated: {
        addListener: (fn: Activated) => listeners.activated.push(fn),
        removeListener: () => undefined,
      },
      onUpdated: {
        addListener: (fn: Updated) => listeners.updated.push(fn),
        removeListener: () => undefined,
      },
    },
    windows: { getCurrent: async () => ({ id: WINDOW }) },
    permissions: { request: requestMock },
  });
});

afterEach(() => {
  render(null, document.body);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount(): Promise<void> {
  await act(() => {
    render(h(Probe, null), document.body);
  });
  await settle();
}

async function switchTab(windowId = WINDOW): Promise<void> {
  for (const listener of listeners.activated) listener({ tabId: 7, windowId });
  await settle();
}

/** Clicks, answers the prompt, and waits until NCBI's answer has been handled. */
async function clickFetch(granted: boolean): Promise<void> {
  api.fetchFromNcbi();
  await settle();
  answerPrompt(granted);
  await settle();
  expect(store.get().ncbiPending).toBeNull();
}

describe('the E-utilities fallback in the panel', () => {
  it('offers NCBI for an abstract page that could not be read, and sends nothing yet', async () => {
    await mount();
    expect(store.get().status).toBe('unreadable');
    expect(store.get().unreadablePmid).toBe(PMID);
    expect(requestMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for the permission inside the click itself, before anything is awaited', async () => {
    await mount();
    api.fetchFromNcbi();
    // Synchronously: a request made after an await can fall outside the gesture.
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith({ origins: [EUTILS_ORIGIN] });
    expect(fetchMock).not.toHaveBeenCalled();
    await settle();
    answerPrompt(false);
    await settle();
  });

  it('shows that it is waiting, and ignores a second click meanwhile', async () => {
    await mount();
    api.fetchFromNcbi();
    api.fetchFromNcbi();
    await settle();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(store.get().ncbiPending).toBe(PMID);
    answerPrompt(true);
    await settle();
    expect(store.get().ncbiPending).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('binds the fetched record after the grant', async () => {
    await mount();
    await clickFetch(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(`id=${PMID}`);
    expect(store.get().status).toBe('ready');
    expect(store.get().article?.pmid).toBe(PMID);
    expect(store.get().article?.source).toBe('eutils');
  });

  it('makes no request at all when the permission is refused', async () => {
    await mount();
    await clickFetch(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get().status).toBe('unreadable');
    expect(store.get().error).toMatch(/not granted/);
  });

  it('reports a permission request the browser rejects, and sends nothing', async () => {
    requestMock.mockImplementationOnce(async () => {
      throw new Error('This function must be called during a user gesture');
    });
    await mount();
    api.fetchFromNcbi();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get().status).toBe('unreadable');
    expect(store.get().error).toMatch(/user gesture/);
    expect(store.get().ncbiPending).toBeNull();
  });

  it('keeps a grant given while the same page was read again', async () => {
    await mount();
    api.fetchFromNcbi();
    await settle();
    // A load event or a switch back to the tab lands while the prompt is up.
    for (const listener of listeners.updated) {
      listener(7, { status: 'complete' }, { active: true, windowId: WINDOW });
    }
    await settle();
    answerPrompt(true);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.get().status).toBe('ready');
    expect(store.get().article?.source).toBe('eutils');
  });

  it('drops the answer when the reader has moved to another article', async () => {
    await mount();
    api.fetchFromNcbi();
    await settle();

    tabUrl = url(OTHER_PMID);
    pageAnswer = { ...PAGE_ARTICLE, pmid: OTHER_PMID };
    await switchTab();
    answerPrompt(true);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get().article?.pmid).toBe(OTHER_PMID);
    expect(store.get().status).toBe('ready');
  });

  it('ignores tab events from another window', async () => {
    await mount();
    queryMock.mockClear();
    await switchTab(WINDOW + 1);
    for (const listener of listeners.updated) {
      listener(9, { status: 'complete' }, { active: true, windowId: WINDOW + 1 });
    }
    await settle();
    expect(queryMock).not.toHaveBeenCalled();

    await switchTab(WINDOW);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('stays on the offer with the reason when NCBI fails', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('', { status: 500 }));
    await mount();
    await clickFetch(true);

    expect(store.get().status).toBe('unreadable');
    expect(store.get().unreadablePmid).toBe(PMID);
    expect(store.get().error).toMatch(/HTTP 500/);
  });

  it('stops offering NCBI once NCBI confirms the record has no abstract', async () => {
    const letter = XML.replace(/<Abstract>[\s\S]*?<\/Abstract>/, '');
    fetchMock.mockImplementation(async () => new Response(letter, { status: 200 }));
    // A PMID of its own: the hook remembers confirmed answers for the session.
    tabUrl = url('1');
    const letterXml = letter.replace(
      /<PMID Version="1">2899772<\/PMID>/,
      '<PMID Version="1">1</PMID>',
    );
    fetchMock.mockImplementation(async () => new Response(letterXml, { status: 200 }));
    await mount();
    await clickFetch(true);

    expect(store.get().status).toBe('unsupported');
    expect(store.get().error).toMatch(/has no abstract/);

    await switchTab();
    expect(store.get().status).toBe('unsupported');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the fetched record, and the reader’s work, when they switch back to the tab', async () => {
    await mount();
    await clickFetch(true);
    actions.setBottomLine('Written after the fetch');

    await switchTab();

    expect(store.get().status).toBe('ready');
    expect(store.get().article?.source).toBe('eutils');
    expect(store.get().bottomLine).toBe('Written after the fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the record and the work when the page becomes readable again', async () => {
    await mount();
    await clickFetch(true);
    actions.setBottomLine('Written after the fetch');

    pageAnswer = { ...PAGE_ARTICLE };
    await switchTab();

    expect(store.get().status).toBe('ready');
    expect(store.get().article?.pmid).toBe(PMID);
    expect(store.get().bottomLine).toBe('Written after the fetch');
  });

  it('does not offer NCBI when the page was read', async () => {
    pageAnswer = { ...PAGE_ARTICLE };
    await mount();
    expect(store.get().status).toBe('ready');
    expect(store.get().unreadablePmid).toBeNull();
  });
});
