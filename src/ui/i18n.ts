/**
 * The language the side panel and the options page render in (#82).
 *
 * The entry points wait for `startLocale()` before they render, so the first
 * paint is already in the stored language, and the page then follows any change
 * to it. The options page writes the preference; an open side panel hears about
 * it through `chrome.storage.onChanged` and re-renders in place.
 */
import { useLayoutEffect, useState } from 'preact/hooks';
import {
  browserLanguage,
  preferenceFromSettings,
  resolveLocale,
  type Locale,
  type LocalePreference,
} from '../lib/i18n';
import { messagesFor, type Messages } from '../locales';

const SETTINGS_KEY = 'settings';

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
 * Reads the stored preference and starts following it. Resolves once the
 * language is known, and never rejects: if storage cannot be read, the browser
 * language stands. Safe to call more than once, and outside the extension (a
 * plain preview, a component test).
 */
export async function startLocale(): Promise<void> {
  if (started) return;
  started = true;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    // A change heard while the read below is pending is newer than its answer.
    let changed = false;
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !(SETTINGS_KEY in changes)) return;
      changed = true;
      const next = preferenceFromSettings(changes[SETTINGS_KEY]?.newValue);
      if (next !== preference) apply(next);
    });
    const items = await chrome.storage.local.get(SETTINGS_KEY);
    if (!changed) apply(preferenceFromSettings(items[SETTINGS_KEY]));
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
