/**
 * The background worker stays minimal and stateless (spec §9, issue #5): it
 * opens the side panel on a user gesture, and keeps both the panel and the
 * toolbar icon scoped to PubMed tabs (#43).
 *
 * Permission note (spec §5): none of this needs `tabs`. `chrome.tabs.get`,
 * `query` and the tab events all work without it — only the sensitive fields of
 * what they return are withheld, and `Tab.url` is populated exactly for the one
 * host we hold a permission for. So a missing url already means "not our
 * business", which is the same reasoning `src/ui/hooks/useArticle.ts` relies on.
 */

import { defineBackground } from 'wxt/utils/define-background';
import { isPubMedUrl } from '../lib/pubmed-url';

const SIDE_PANEL_PATH = 'sidepanel.html';

/** Matches `action.default_title` in wxt.config.ts. */
const ACTIVE_TITLE = 'Open Journal Club Helper';

/**
 * Disabling the panel on a tab leaves the toolbar icon lit and its click
 * silent, which reads as a broken extension. Greying the icon out and saying
 * where the extension works turns that dead click into an answer (#43).
 */
const IDLE_TITLE = 'Journal Club Helper — open a PubMed abstract page to use it';

function report(error: unknown): void {
  console.error('[journal-club-helper] side panel:', error);
}

function isOpenSidePanel(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'OPEN_SIDE_PANEL'
  );
}

/**
 * Decides one tab's fate from its url. `side_panel.default_path` makes the panel
 * available on *every* tab, so once opened it followed the reader to every other
 * site; the per-tab option is what overrides that global default (#43).
 *
 * Exported for the unit tests: this runs on every tab switch in the browser and
 * a wrong answer here is either a panel that will not open or one that will not
 * go away.
 */
export async function applyTabScope(tabId: number, url: string | undefined): Promise<void> {
  const onPubMed = isPubMedUrl(url);
  await chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: onPubMed });
  await chrome.action.setTitle({ tabId, title: onPubMed ? ACTIVE_TITLE : IDLE_TITLE });
  if (onPubMed) await chrome.action.enable(tabId);
  else await chrome.action.disable(tabId);
}

/** A tab can close between the event and the call, so every path here may reject. */
function scopeTab(tabId: number, url: string | undefined): void {
  void applyTabScope(tabId, url).catch(report);
}

/** `onActivated` carries no url, so the tab has to be looked up. */
async function scopeActivatedTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  await applyTabScope(tabId, tab.url);
}

/**
 * Install, update and browser restart all leave tabs that never fired an event,
 * and after an update they carry the options of the previous version.
 */
export async function scopeAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number' || tab.id < 0) return;
      await applyTabScope(tab.id, tab.url);
    }),
  );
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    // Makes the toolbar icon open the panel as well.
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(report);
    void scopeAllTabs().catch(report);
  });

  chrome.runtime.onStartup.addListener(() => {
    void scopeAllTabs().catch(report);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void scopeActivatedTab(tabId).catch(report);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Navigating *away* from PubMed hands us no `changeInfo.url` — that field is
    // withheld for hosts we hold no permission for — so the status change is the
    // only notice we get, and both have to count or the panel would survive on
    // the site the reader left for.
    if (changeInfo.status === undefined && changeInfo.url === undefined) return;
    scopeTab(tabId, tab.url);
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    const tabId = sender.tab?.id;
    if (!isOpenSidePanel(message) || tabId === undefined) return false;
    // Neither call is awaited: sidePanel.open() is only allowed inside the user
    // gesture forwarded by the click, and an await would close that window. The
    // enable is kept even though the tab scoping should already have done it —
    // the click is the reader's one way in, and it must not depend on an event
    // having fired first.
    void chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true }).catch(report);
    void chrome.sidePanel.open({ tabId }).catch(report);
    return false;
  });
});
