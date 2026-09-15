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
 */
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { actions, store, useStore } from '../store';
import type { ArticleStatus } from '../store';
import type { GetArticleMessage, GetArticleResponse, PubMedArticle } from '../../lib/types';

export interface UseArticle {
  article: PubMedArticle | null;
  status: ArticleStatus;
  reload: () => void;
}

const PUBMED_HOST = 'pubmed.ncbi.nlm.nih.gov';

/** `https://pubmed.ncbi.nlm.nih.gov/<PMID>/` — the only page the panel works on (spec §4.1). */
const ABSTRACT_PATH = /^\/\d+\/?$/;

/** chrome.tabs.sendMessage rejects with one of these when no content script is listening. */
const NO_RECEIVER =
  /receiving end does not exist|could not establish connection|message port closed/i;

const UNREADABLE =
  'This PubMed page could not be read. Reload the page, or open a different abstract.';

/** The content script runs at document_idle, so a message sent too early can miss it once. */
const RETRY_DELAY_MS = 400;

function parseUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isAbstractUrl(url: URL | null): boolean {
  return url !== null && url.hostname === PUBMED_HOST && ABSTRACT_PATH.test(url.pathname);
}

function readResponse(raw: unknown): PubMedArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  return (raw as GetArticleResponse).article ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The panel could not read the page.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestArticle(tabId: number, retry: boolean): Promise<PubMedArticle | null> {
  const message: GetArticleMessage = { type: 'GET_ARTICLE' };
  try {
    return readResponse(await chrome.tabs.sendMessage(tabId, message));
  } catch (error) {
    if (!retry || !NO_RECEIVER.test(errorMessage(error))) throw error;
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

async function load(isCurrent: () => boolean): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    actions.setStatus('unsupported');
    return;
  }
  actions.setStatus('loading');
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isCurrent()) return;

    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number' || tab.id < 0) {
      actions.setStatus('unsupported');
      return;
    }

    const url = parseUrl(tab.url);
    // A readable url that is not PubMed needs no round trip. An unreadable one
    // means we hold no host permission there, which comes to the same thing,
    // but we still ask: the reply, or its absence, is the authority.
    if (url && url.hostname !== PUBMED_HOST) {
      actions.setStatus('unsupported');
      return;
    }

    const onAbstract = isAbstractUrl(url);
    const article = await requestArticle(tab.id, onAbstract);
    if (!isCurrent()) return;

    if (!article) {
      actions.setStatus('unsupported', onAbstract ? UNREADABLE : null);
      return;
    }
    bind(article);
  } catch (error) {
    if (!isCurrent()) return;
    if (NO_RECEIVER.test(errorMessage(error))) {
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

  useEffect(() => {
    reload();
    if (typeof chrome === 'undefined' || !chrome.tabs?.onActivated) return;

    const onActivated = () => reload();
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (!tab.active) return;
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

  return { article, status, reload };
}
