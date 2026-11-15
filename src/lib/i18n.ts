/**
 * Which language the extension speaks (#82).
 *
 * The default follows the browser: Japanese for a `ja` browser, English for
 * everything else. The options page can pin either one, stored with the other
 * settings in chrome.storage.local. `chrome.i18n` alone cannot do that, since it
 * always follows the browser, so the catalogs live in `src/locales/` and every
 * page resolves the language itself.
 */

export type Locale = 'en' | 'ja';
export type LocalePreference = 'auto' | Locale;

export const LOCALE_PREFERENCES: readonly LocalePreference[] = ['auto', 'en', 'ja'];

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'auto' || value === 'en' || value === 'ja';
}

/** `uiLanguage` is a BCP 47 tag such as `ja`, `ja-JP` or `en-US`. */
export function resolveLocale(
  preference: LocalePreference,
  uiLanguage: string | undefined,
): Locale {
  if (preference !== 'auto') return preference;
  return /^ja(?:-|$)/i.test(uiLanguage ?? '') ? 'ja' : 'en';
}

/** The browser's UI language, from wherever this code is running. */
export function browserLanguage(): string | undefined {
  try {
    if (typeof chrome !== 'undefined' && typeof chrome.i18n?.getUILanguage === 'function') {
      return chrome.i18n.getUILanguage();
    }
  } catch {
    // A dead extension context throws; the navigator answer is as good.
  }
  return typeof navigator === 'undefined' ? undefined : navigator.language;
}

/** The preference inside a stored `settings` record, or `auto` for anything else. */
export function preferenceFromSettings(settings: unknown): LocalePreference {
  if (typeof settings !== 'object' || settings === null) return 'auto';
  const value = (settings as { locale?: unknown }).locale;
  return isLocalePreference(value) ? value : 'auto';
}
