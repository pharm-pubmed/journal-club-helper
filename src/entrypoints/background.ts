/**
 * The background worker stays minimal and stateless (spec §9, issue #5):
 * its only job is opening the side panel on a user gesture.
 */

import { defineBackground } from 'wxt/utils/define-background';

const SIDE_PANEL_PATH = 'sidepanel.html';

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

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    // Makes the toolbar icon open the panel as well.
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(report);
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    const tabId = sender.tab?.id;
    if (!isOpenSidePanel(message) || tabId === undefined) return false;
    // Neither call is awaited: sidePanel.open() is only allowed inside the user
    // gesture forwarded by the click, and an await would close that window.
    void chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true }).catch(report);
    void chrome.sidePanel.open({ tabId }).catch(report);
    return false;
  });
});
