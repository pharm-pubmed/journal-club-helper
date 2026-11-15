/**
 * The language the side panel and the options page render in (#82).
 *
 * It starts from the browser language, so the first paint is already right for
 * nearly everyone, then reads the stored preference and follows any change to
 * it. The options page writes the preference; an open side panel hears about
 * it through `chrome.storage.onChanged` and re-renders in place.
 */
import { useLayoutEffect, useState } from 'preact/hooks';
import {
  browserLanguage,
  isLocalePreference,
  preferenceFromSettings,
  resolveLocale,
  type Locale,
  type LocalePreference,
} from '../lib/i18n';
import { messagesFor, type Messages } from '../locales';

const SETTINGS_KEY = 'settings';

/**
 * The last preference this browser used, copied into the page's localStorage
 * so the first paint is in the right language before chrome.storage answers.
 * chrome.storage stays the source of truth; this is only a hint.
 */
const HINT_KEY = 'jch-locale-preference';

function readHint(): LocalePreference {
  try {
    const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(HINT_KEY);
    return isLocalePreference(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function writeHint(next: LocalePreference): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(HINT_KEY, next);
  } catch {
    // No localStorage: the first paint follows the browser, then corrects.
  }
}

let preference: LocalePreference = 'auto';
let locale: Locale = resolveLocale('auto', browserLanguage());
/** Bumped on every change, so a component that subscribed late can catch up. */
let version = 0;
const listeners = new Set<() => void>();

function apply(next: LocalePreference): void {
  version += 1;
  preference = next;
  const resolved = resolveLocale(next, browserLanguage());
  if (resolved === locale) {
    for (const listener of listeners) listener();
    return;
  }
  locale = resolved;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const listener of listeners) listener();
}

let started = false;

/**
 * Reads the stored preference and starts following it. Safe to call more than
 * once, and a no-op outside the extension (a plain preview, a component test).
 */
export function startLocale(): void {
  if (started) return;
  started = true;
  const hint = readHint();
  preference = hint;
  locale = resolveLocale(hint, browserLanguage());
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    void chrome.storage.local
      .get(SETTINGS_KEY)
      .then((items) => {
        const stored = preferenceFromSettings(items[SETTINGS_KEY]);
        writeHint(stored);
        apply(stored);
      })
      .catch(() => undefined);
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !(SETTINGS_KEY in changes)) return;
      const next = preferenceFromSettings(changes[SETTINGS_KEY]?.newValue);
      writeHint(next);
      if (next !== preference) apply(next);
    });
  } catch {
    // A dead extension context: stay with the browser language.
  }
}

export function currentLocale(): Locale {
  return locale;
}

export function currentPreference(): LocalePreference {
  return preference;
}

/**
 * Switches this page at once, without waiting for storage to report the write.
 * Other pages follow through `chrome.storage.onChanged`. Tests use it too.
 */
export function applyPreference(next: LocalePreference): void {
  writeHint(next);
  if (next !== preference || resolveLocale(next, browserLanguage()) !== locale) apply(next);
}

function useLocaleVersion(): void {
  const [seen, setSeen] = useState(version);
  // A layout effect, and a catch-up check after subscribing: the stored
  // preference can arrive between the first render and the subscription, and
  // a change announced to nobody would leave this component in the old language.
  useLayoutEffect(() => {
    const listener = () => setSeen(version);
    listeners.add(listener);
    if (seen !== version) listener();
    return () => {
      listeners.delete(listener);
    };
    // Subscribes once; `seen` is only compared at that moment.
  }, []);
}

/** The messages for the current language; the component re-renders when it changes. */
export function useMessages(): Messages {
  useLocaleVersion();
  return messagesFor(locale);
}

/** The current language and preference, re-rendering on change. */
export function useLocale(): { locale: Locale; preference: LocalePreference } {
  useLocaleVersion();
  return { locale, preference };
}
