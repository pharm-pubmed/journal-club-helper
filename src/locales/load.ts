/**
 * For the scripts that have no Preact tree to re-render: the content script's
 * page button and the background's toolbar title (#82). They read the stored
 * preference when they need a message, and fall back to the browser language
 * when storage cannot be read.
 */
import { browserLanguage, preferenceFromSettings, resolveLocale } from '../lib/i18n';
import { messagesFor, type Messages } from '.';

export async function loadMessages(): Promise<Messages> {
  let preference = preferenceFromSettings(null);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const items = await chrome.storage.local.get('settings');
      preference = preferenceFromSettings(items['settings']);
    }
  } catch {
    // Storage unreadable or the context gone: the browser language decides.
  }
  return messagesFor(resolveLocale(preference, browserLanguage()));
}
