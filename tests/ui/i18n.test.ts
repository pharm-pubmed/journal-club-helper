// @vitest-environment happy-dom
/**
 * The side panel's and the options page's language (#82): read from storage,
 * followed when Settings changes it, and never missed by a component that
 * subscribed after the stored value arrived.
 */
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type ChangeListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

let stored: Record<string, unknown>;
let changeListeners: ChangeListener[];
let resolveGet: (() => void) | null;

function fakeChrome(deferred = false) {
  return {
    i18n: { getUILanguage: () => 'en-US' },
    storage: {
      local: {
        get: (key: string) =>
          new Promise((resolve) => {
            const answer = () => resolve({ [key]: stored[key] });
            if (deferred) resolveGet = answer;
            else answer();
          }),
      },
      onChanged: { addListener: (listener: ChangeListener) => changeListeners.push(listener) },
    },
  };
}

function emit(area: string, key: string, newValue: unknown): void {
  for (const listener of changeListeners) listener({ [key]: { newValue } }, area);
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.resetModules();
  stored = {};
  changeListeners = [];
  resolveGet = null;
  localStorage.clear();
});

afterEach(() => {
  render(null, document.body);
  vi.unstubAllGlobals();
});

async function load() {
  const i18n = await import('../../src/ui/i18n');
  function Probe() {
    const m = i18n.useMessages();
    return h('p', null, m.app.settings);
  }
  return { i18n, Probe };
}

it('reads the stored preference and follows changes to it', async () => {
  stored['settings'] = { locale: 'ja' };
  vi.stubGlobal('chrome', fakeChrome());
  const { i18n, Probe } = await load();
  i18n.startLocale();
  await act(() => render(h(Probe, null), document.body));
  await flush();
  expect(document.body.textContent).toBe('設定');
  expect(document.documentElement.lang).toBe('ja');

  emit('sync', 'settings', { locale: 'en' });
  emit('local', 'other', { locale: 'en' });
  await flush();
  expect(document.body.textContent).toBe('設定');

  emit('local', 'settings', { locale: 'en' });
  await flush();
  expect(document.body.textContent).toBe('Settings');
  expect(document.documentElement.lang).toBe('en');
});

// The stored value lands after the first render. The subscription is a layout
// effect, which Preact runs within render(), so it is in place before the
// read can answer; the catch-up check in useLocaleVersion backs that up and is
// not separately reachable from here.
it('switches a component rendered before the stored value arrives', async () => {
  stored['settings'] = { locale: 'ja' };
  vi.stubGlobal('chrome', fakeChrome(true));
  const { i18n, Probe } = await load();
  i18n.startLocale();
  const vnode = h(Probe, null);
  // Render without letting effects run, then answer the storage read.
  render(vnode, document.body);
  resolveGet?.();
  await flush();
  expect(document.body.textContent).toBe('設定');
});

it('paints first in the language this page used last time', async () => {
  localStorage.setItem('jch-locale-preference', 'ja');
  vi.stubGlobal('chrome', fakeChrome(true));
  const { i18n, Probe } = await load();
  i18n.startLocale();
  await act(() => render(h(Probe, null), document.body));
  expect(document.body.textContent).toBe('設定');
});
