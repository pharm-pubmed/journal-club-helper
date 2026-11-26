/**
 * Binds the side panel to the article in the active tab (issue #6).
 *
 * Permission note (spec §5): the extension deliberately does NOT hold `tabs`.
 * `chrome.tabs.query` works without it, and `Tab.url` is only populated for
 * hosts we do have permission for — PubMed. So "no url" is itself the signal
 * that the active tab is none of our business, and telling a PubMed tab from
 * any other costs no extra permission. `onActivated` / `onUpdated` fire without
 * `tabs` too; only the sensitive fields of their payloads (url, title,
 * favIconUrl) are withheld, and we re-query rather than read them.
 *
 * When an abstract page cannot be read, the panel offers to fetch the record
 * from NCBI instead (#23). That fetch is deliberately not tied to the reads
 * above: a tab event that re-reads the same page must not throw away a grant
 * the reader is in the middle of giving. It binds its result only if the
 * reader is still on that page when it arrives.
 */
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { actions, store, useStore } from '../store';
import type { ArticleStatus } from '../store';
import { EUTILS_ORIGIN, EutilsError, fetchArticleFromEutils } from '../../lib/eutils';
import { messagesFor, type Messages } from '../../locales';
import { describeError } from '../../locales/errors';
import { currentLocale } from '../i18n';
import { parsePmidFromUrl } from '../../lib/pubmed-url';
import type { GetArticleMessage, GetArticleResponse, PubMedArticle } from '../../lib/types';

export interface UseArticle {
  article: PubMedArticle | null;
  status: ArticleStatus;
  reload: () => void;
  /**
   * Fetches the unreadable page's record from NCBI (#23). Call it straight from
   * a click: the browser shows the permission prompt only inside a user gesture.
   */
  fetchFromNcbi: () => void;
}

const PUBMED_HOST = 'pubmed.ncbi.nlm.nih.gov';

/** chrome.tabs.sendMessage rejects with one of these when no content script is listening. */
const NO_RECEIVER =
  /receiving end does not exist|could not establish connection|message port closed/i;

/** The content script runs at document_idle, so a message sent too early can miss it once. */
const RETRY_DELAY_MS = 400;

/**
 * The PMID of the abstract page in the active tab, as of the last read; null
 * when that tab is not an abstract page. An NCBI answer is bound only if it is
 * for this PMID, so an answer for a page the reader has left is dropped.
 */
let pagePmid: string | null = null;

/** Records NCBI confirmed have nothing to appraise, with its reason, so the offer is not repeated. */
const nothingToAppraise = new Map<string, string>();

function parseUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function readResponse(raw: unknown): PubMedArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  return (raw as GetArticleResponse).article ?? null;
}

/** The language the panel is speaking now; read at the moment a message is written. */
function messages(): Messages {
  return messagesFor(currentLocale());
}

/** Shown to the reader, so in their language (#82). */
function errorMessage(error: unknown): string {
  const m = messages();
  return describeError(error, m, m.errors.readFailed);
}

/**
 * The browser's own text, for recognising its errors. Never shown: a match on
 * it must not depend on the language the panel speaks.
 */
function rawText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestArticle(tabId: number, retry: boolean): Promise<PubMedArticle | null> {
  const message: GetArticleMessage = { type: 'GET_ARTICLE' };
  try {
    return readResponse(await chrome.tabs.sendMessage(tabId, message));
  } catch (error) {
    if (!retry || !NO_RECEIVER.test(rawText(error))) throw error;
    await sleep(RETRY_DELAY_MS);
    return readResponse(await chrome.tabs.sendMessage(tabId, message));
  }
}

/**
 * Binding an article resets every tab's answers (`store.resetForArticle`), so
 * re-reading the same PMID — which happens on every switch back to the tab —
 * must not go through `setArticle` or the user's work would be wiped.
 */
function bind(article: PubMedArticle): void {
  const current = store.get().article;
  if (!current || current.pmid !== article.pmid) actions.setArticle(article);
  actions.setStatus('ready');
}

/**
 * The permission request is the first thing called, before any await, so it
 * runs inside the click. Without the grant nothing is fetched: this is the
 * only network request the extension makes, and the browser would let it
 * through without the permission (NCBI allows cross-origin reads), so the
 * await below is what enforces "nothing without consent".
 */
async function fetchFromNcbi(pmid: string, request: Promise<boolean>): Promise<void> {
  const stillHere = () => pagePmid === pmid;
  try {
    let granted = false;
    try {
      granted = await request;
    } catch (error) {
      if (stillHere()) actions.setUnreadable(pmid, errorMessage(error));
      return;
    }
    if (!stillHere()) return;
    if (!granted) {
      actions.setUnreadable(pmid, messages().errors.notGranted);
      return;
    }

    let article: PubMedArticle;
    try {
      article = await fetchArticleFromEutils(pmid);
    } catch (error) {
      if (!stillHere()) return;
      const final =
        error instanceof EutilsError && (error.kind === 'no-abstract' || error.kind === 'book');
      // A record NCBI confirms has nothing to appraise is not worth offering again.
      if (final) {
        nothingToAppraise.set(pmid, errorMessage(error));
        actions.setStatus('unsupported', errorMessage(error));
      } else {
        actions.setUnreadable(pmid, errorMessage(error));
      }
      return;
    }
    if (stillHere()) bind(article);
  } finally {
    actions.setNcbiPending(null);
  }
}

async function load(isCurrent: () => boolean): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    actions.setStatus('unsupported');
    return;
  }
  // While NCBI is being asked for this page, keep showing that rather than a spinner.
  if (store.get().status !== 'unreadable') actions.setStatus('loading');
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isCurrent()) return;

    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number' || tab.id < 0) {
      pagePmid = null;
      actions.setStatus('unsupported');
      return;
    }

    const url = parseUrl(tab.url);
    // A readable url that is not PubMed needs no round trip. An unreadable one
    // means we hold no host permission there, which comes to the same thing,
    // but we still ask: the reply, or its absence, is the authority.
    if (url && url.hostname !== PUBMED_HOST) {
      pagePmid = null;
      actions.setStatus('unsupported');
      return;
    }

    const pmid = tab.url ? parsePmidFromUrl(tab.url) : null;
    pagePmid = pmid;
    const article = await requestArticle(tab.id, pmid !== null);
    if (!isCurrent()) return;

    if (article) {
      bind(article);
      return;
    }
    if (!pmid) {
      actions.setStatus('unsupported');
      return;
    }
    const settled = nothingToAppraise.get(pmid);
    if (settled !== undefined) {
      actions.setStatus('unsupported', settled);
      return;
    }
    // Already fetched from NCBI for this page: switching back to the tab
    // must not throw the reader back to the offer, or wipe their work.
    const current = store.get().article;
    if (current?.pmid === pmid && current.source === 'eutils') {
      actions.setStatus('ready');
      return;
    }
    actions.setUnreadable(pmid, pmid === store.get().unreadablePmid ? store.get().error : null);
  } catch (error) {
    if (!isCurrent()) return;
    pagePmid = null;
    if (NO_RECEIVER.test(rawText(error))) {
      // Nothing listening in that tab: not a failure, just not a PubMed abstract.
      actions.setStatus('unsupported');
      return;
    }
    actions.setStatus('error', errorMessage(error));
  }
}

export function useArticle(): UseArticle {
  const article = useStore((s) => s.article);
  const status = useStore((s) => s.status);
  // Only the newest request may write to the store; tab switches overlap.
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    void load(() => requestId.current === id);
  }, []);

  const fetchFromNcbiNow = useCallback(() => {
    const { unreadablePmid, ncbiPending } = store.get();
    // A second click while the first is still being answered does nothing.
    if (!unreadablePmid || ncbiPending) return;
    if (typeof chrome === 'undefined' || !chrome.permissions?.request) {
      actions.setUnreadable(unreadablePmid, messages().errors.noPermissionsApi);
      return;
    }
    const request = chrome.permissions.request({ origins: [EUTILS_ORIGIN] });
    actions.setNcbiPending(unreadablePmid);
    void fetchFromNcbi(unreadablePmid, request);
  }, []);

  useEffect(() => {
    reload();
    if (typeof chrome === 'undefined' || !chrome.tabs?.onActivated) return;

    // Tab events arrive from every window; only this panel's window matters,
    // and an event from another one would otherwise re-read for nothing.
    let windowId: number | null = null;
    void chrome.windows
      ?.getCurrent?.()
      .then((current) => {
        windowId = current.id ?? null;
      })
      .catch(() => undefined);
    const ours = (id: number) => windowId === null || id === windowId;

    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (ours(info.windowId)) reload();
    };
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (!tab.active || !ours(tab.windowId)) return;
      // `changeInfo.url` only arrives for hosts we have permission for; `status`
      // covers the ordinary page load everywhere else.
      if (changeInfo.status === 'complete' || changeInfo.url !== undefined) reload();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      // Invalidate anything still in flight so it cannot write after unmount.
      requestId.current += 1;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [reload]);

  return { article, status, reload, fetchFromNcbi: fetchFromNcbiNow };
}
