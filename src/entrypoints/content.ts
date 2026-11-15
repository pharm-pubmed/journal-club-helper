/**
 * PubMed abstract page content script (issues #4 and #5).
 *
 * Two jobs only: answer `GET_ARTICLE` with what the page says, and inject the
 * single `Journal Club` button that opens the side panel. Nothing else in the
 * page is touched (spec §3-2, issue #1 B4).
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractArticleFromDocument } from '../lib/pubmed-dom';
import { parsePmidFromUrl } from '../lib/pubmed-url';
import type { GetArticleResponse, OpenSidePanelMessage, PubMedArticle } from '../lib/types';
import { en, type Messages } from '../locales/en';
import { loadMessages } from '../locales/load';

const BUTTON_ID = 'jch-open';

/** English until the stored language has been read, which is before the button is added. */
let messages: Messages = en;

/** Inline so the extension ships no global CSS into the page (issue #5). */
const BUTTON_STYLE = [
  'display:inline-block',
  'margin-left:8px',
  'padding:1px 8px',
  'font:inherit',
  'font-size:13px',
  'line-height:1.6',
  'vertical-align:middle',
  'color:#20558a',
  'background-color:#ffffff',
  'border:1px solid #20558a',
  'border-radius:4px',
  'cursor:pointer',
].join(';');

function hasType(message: unknown, type: string): boolean {
  return (
    typeof message === 'object' && message !== null && (message as { type?: unknown }).type === type
  );
}

/** Abstract heading first, article title as the fallback (issue #5). */
function findAnchor(): { element: Element; inline: boolean } | null {
  // PubMed's abstract heading is a block-level h2, so a sibling button would
  // land on its own line below it. Spec §3-1 wants it beside the heading, and a
  // button is valid phrasing content inside one, so it goes in as the last
  // child. The cost is that the heading's accessible name becomes
  // "Abstract Journal Club"; the button is still announced as its own control.
  const abstractHeading =
    document.querySelector('#abstract h2') ?? document.querySelector('#abstract .title');
  if (abstractHeading !== null) return { element: abstractHeading, inline: true };

  // The article title is long and wraps, so the fallback sits after it instead.
  const title = document.querySelector('h1.heading-title');
  return title === null ? null : { element: title, inline: false };
}

/**
 * The panel cannot be opened from a page whose extension context has died, and
 * the button is the only element we are allowed to put on the page — so it has
 * to carry the explanation itself. A dead click with no feedback reads as a
 * broken extension; "reload the page" is both true and actionable.
 */
function reportStale(button: HTMLButtonElement): void {
  button.textContent = messages.pageButton.stale;
  button.title = messages.pageButton.staleTitle;
  button.disabled = true;
}

/**
 * Exported so both failure paths can be tested. They are easy to get wrong and
 * impossible to notice: a dead click looks exactly like a working one.
 */
export function requestPanel(button: HTMLButtonElement): void {
  const message: OpenSidePanelMessage = { type: 'OPEN_SIDE_PANEL' };
  try {
    // `.catch` alone is not enough. After the extension is reloaded or updated,
    // a page left open still runs the old content script, and sendMessage on
    // that dead context throws synchronously instead of returning a promise —
    // so the rejection handler never gets the chance to run.
    const sent: unknown = chrome.runtime.sendMessage(message);
    if (sent instanceof Promise) void sent.catch(() => reportStale(button));
  } catch {
    reportStale(button);
  }
}

function readArticle(): PubMedArticle | null {
  try {
    return extractArticleFromDocument(document, window.location.href);
  } catch (error) {
    console.error('[journal-club-helper] could not read this PubMed page:', error);
    return null;
  }
}

function injectButton(): void {
  if (document.getElementById(BUTTON_ID) !== null) return;
  const anchor = findAnchor();
  if (anchor === null) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = messages.pageButton.label;
  button.title = messages.pageButton.title;
  button.style.cssText = BUTTON_STYLE;
  button.addEventListener('click', () => {
    requestPanel(button);
  });

  if (anchor.inline) anchor.element.appendChild(button);
  else anchor.element.insertAdjacentElement('afterend', button);
}

export default defineContentScript({
  matches: ['https://pubmed.ncbi.nlm.nih.gov/*'],
  runAt: 'document_idle',
  main() {
    // Search results and every other PubMed page are ignored (spec §4.1).
    if (parsePmidFromUrl(window.location.href) === null) return;

    // `extractArticleFromDocument` is written to return null rather than throw,
    // but this runs on a page nobody here controls and one unexpected shape must
    // not take the button down with it: the panel can say it could not read the
    // page, whereas a reader with no button has no way in at all.
    //
    // Read on every request rather than once at load, so the panel's "Read the
    // page again" means what it says (#23). A page is a few kilobytes of DOM;
    // reading it costs less than a millisecond.
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!hasType(message, 'GET_ARTICLE')) return false;
      const article: PubMedArticle | null = readArticle();
      const response: GetArticleResponse = { article };
      sendResponse(response);
      return false;
    });

    // A language change in Settings relabels a button already on the page (#82).
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !('settings' in changes)) return;
        void loadMessages().then((loaded) => {
          messages = loaded;
          const button = document.getElementById(BUTTON_ID);
          if (!(button instanceof HTMLButtonElement) || button.disabled) return;
          button.textContent = messages.pageButton.label;
          button.title = messages.pageButton.title;
        });
      });
    } catch {
      // No storage events in this context; the label stays as first read.
    }

    void loadMessages()
      .then((loaded) => {
        messages = loaded;
      })
      .finally(() => {
        try {
          injectButton();
        } catch (error) {
          console.error('[journal-club-helper] could not add the Journal Club button:', error);
        }
      });
  },
});
