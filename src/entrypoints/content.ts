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

const BUTTON_ID = 'jch-open';
const BUTTON_LABEL = 'Journal Club';

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

function injectButton(): void {
  if (document.getElementById(BUTTON_ID) !== null) return;
  const anchor = findAnchor();
  if (anchor === null) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = BUTTON_LABEL;
  button.title = 'Open the critical appraisal panel';
  button.style.cssText = BUTTON_STYLE;
  button.addEventListener('click', () => {
    const message: OpenSidePanelMessage = { type: 'OPEN_SIDE_PANEL' };
    void chrome.runtime.sendMessage(message).catch(() => undefined);
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

    // PubMed navigates with full page loads, so one extraction per load is enough.
    const article: PubMedArticle | null = extractArticleFromDocument(
      document,
      window.location.href,
    );

    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!hasType(message, 'GET_ARTICLE')) return false;
      const response: GetArticleResponse = { article };
      sendResponse(response);
      return false;
    });

    injectButton();
  },
});
