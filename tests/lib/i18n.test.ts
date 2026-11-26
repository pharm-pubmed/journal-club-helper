/**
 * Which language the extension speaks (#82): the browser's by default, or the
 * one the reader pinned in Settings.
 */
import { describe, expect, it } from 'vitest';
import { preferenceFromSettings, resolveLocale } from '../../src/lib/i18n';
import { en } from '../../src/locales/en';
import { ja } from '../../src/locales/ja';

describe('resolveLocale', () => {
  it('follows a Japanese browser and nothing else when set to auto', () => {
    expect(resolveLocale('auto', 'ja')).toBe('ja');
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja');
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'fr')).toBe('en');
    expect(resolveLocale('auto', 'jav')).toBe('en');
    expect(resolveLocale('auto', undefined)).toBe('en');
  });

  it('lets a pinned language win over the browser', () => {
    expect(resolveLocale('en', 'ja')).toBe('en');
    expect(resolveLocale('ja', 'en-US')).toBe('ja');
  });
});

describe('preferenceFromSettings', () => {
  it('reads a stored preference and treats anything else as auto', () => {
    expect(preferenceFromSettings({ locale: 'ja' })).toBe('ja');
    expect(preferenceFromSettings({ locale: 'de' })).toBe('auto');
    expect(preferenceFromSettings({ counters: {} })).toBe('auto');
    expect(preferenceFromSettings(undefined)).toBe('auto');
  });
});

/** Every key in one catalog is in the other, at every depth. The type checks this too. */
function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, shape(inner)]),
    );
  }
  return typeof value;
}

describe('the catalogs', () => {
  it('have the same messages in English and Japanese', () => {
    expect(shape(ja)).toEqual(shape(en));
  });

  it('leave no Japanese message empty or in English by mistake', () => {
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk);
    };
    walk(ja);
    const english = new Set<string>();
    const walkEn = (value: unknown): void => {
      if (typeof value === 'string') english.add(value);
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walkEn);
    };
    walkEn(en);
    // Names and abbreviations that are the same in both languages.
    // Language names are written in their own language in both catalogs.
    // Formulas and notation read the same in both languages.
    const same = new Set([
      'Journal Club Helper',
      'PICO',
      'English',
      '日本語',
      'n / N',
      'ARR = CER − EER',
      'RRR = ARR ÷ CER',
    ]);
    for (const text of strings) {
      expect(text.trim()).not.toBe('');
      if (english.has(text)) expect(same, `untranslated: ${text}`).toContain(text);
    }
  });

  // A function message is only text once called, so call each one with
  // stand-in values and compare the two languages' answers.
  it('translate every function message', () => {
    const args = [3, 2, 'merge'];
    const argsFor: Record<string, unknown[]> = {
      'labels.subtypeLineFallback': ['factorial'],
      'pico.markTitle': ['Population', 'numeric result', ['Outcome']],
    };
    // These print only a PMID, so they are the same in both languages.
    const same = new Set(['header.pmid']);
    const walk = (enNode: unknown, jaNode: unknown, path: string): void => {
      if (typeof enNode === 'function' && typeof jaNode === 'function') {
        const english = String(
          (enNode as (...a: unknown[]) => unknown)(...(argsFor[path] ?? args)),
        );
        const japanese = String(
          (jaNode as (...a: unknown[]) => unknown)(...(argsFor[path] ?? args)),
        );
        expect(japanese.trim(), path).not.toBe('');
        if (!same.has(path)) expect(japanese, path).not.toBe(english);
        return;
      }
      if (typeof enNode === 'object' && enNode !== null) {
        for (const [key, value] of Object.entries(enNode)) {
          walk(value, (jaNode as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
        }
      }
    };
    walk(en, ja, '');
  });

  it('name what is deleted without a count of zero', () => {
    expect(ja.options.confirmText(0, 2)).not.toContain('吟味 0 件');
    expect(ja.options.deleted(0, 3)).not.toContain('吟味 0 件');
    expect(ja.options.confirmText(4, 0)).toContain('吟味 4 件を削除しますか');
    expect(en.options.confirmText(0, 2)).toBe(
      'Delete 2 records this version could not read? They are stored only in this browser, on this device. There is no copy on a server and no account to restore from, so this cannot be undone. Export a backup first if there is any chance you want them back.',
    );
  });
});
