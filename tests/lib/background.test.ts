/**
 * Scoping the side panel and the toolbar icon to PubMed tabs (#43).
 *
 * `side_panel.default_path` makes the panel available on every tab, so once the
 * reader opened it, it followed them to every other site. The per-tab option is
 * the only thing that overrides that, and it is driven from `Tab.url` — a field
 * the browser populates for PubMed and withholds everywhere else, because that
 * is the one host this extension holds a permission for.
 *
 * The absent-url case is therefore not an edge case but the mechanism, which is
 * why it is tested as carefully as the positive one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTabScope, scopeAllTabs } from '../../src/entrypoints/background';

interface Calls {
  setOptions: { tabId: number; path: string; enabled: boolean }[];
  setTitle: { tabId: number; title: string }[];
  enable: number[];
  disable: number[];
}

let calls: Calls;

function install(tabs: { id?: number; url?: string }[] = []): void {
  calls = { setOptions: [], setTitle: [], enable: [], disable: [] };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    sidePanel: {
      setOptions: vi.fn((options: Calls['setOptions'][number]) => {
        calls.setOptions.push(options);
        return Promise.resolve();
      }),
    },
    action: {
      setTitle: vi.fn((options: Calls['setTitle'][number]) => {
        calls.setTitle.push(options);
        return Promise.resolve();
      }),
      enable: vi.fn((tabId: number) => {
        calls.enable.push(tabId);
        return Promise.resolve();
      }),
      disable: vi.fn((tabId: number) => {
        calls.disable.push(tabId);
        return Promise.resolve();
      }),
    },
    tabs: { query: vi.fn(() => Promise.resolve(tabs)) },
  };
}

beforeEach(() => {
  install();
});

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('applyTabScope', () => {
  it('turns the panel on for a PubMed abstract', async () => {
    await applyTabScope(7, 'https://pubmed.ncbi.nlm.nih.gov/36577095/');

    expect(calls.setOptions).toEqual([{ tabId: 7, path: 'sidepanel.html', enabled: true }]);
    expect(calls.enable).toEqual([7]);
    expect(calls.disable).toEqual([]);
  });

  it('stays on across the PubMed result list, not just the abstract', async () => {
    // Deliberately wider than the page the panel can read. A reader works
    // through a result list one article at a time, and closing the panel on
    // every trip back would mean reopening it for each one.
    await applyTabScope(7, 'https://pubmed.ncbi.nlm.nih.gov/?term=statins');

    expect(calls.setOptions[0]?.enabled).toBe(true);
    expect(calls.enable).toEqual([7]);
  });

  it('turns the panel off on another site', async () => {
    await applyTabScope(7, 'https://example.com/');

    expect(calls.setOptions).toEqual([{ tabId: 7, path: 'sidepanel.html', enabled: false }]);
    expect(calls.disable).toEqual([7]);
    expect(calls.enable).toEqual([]);
  });

  it('treats a url the browser withheld as not PubMed', async () => {
    // This is the whole mechanism, not an edge case: without the `tabs`
    // permission the url arrives only for hosts we have a permission for, so
    // "no url" is the browser telling us this tab is none of our business.
    await applyTabScope(7, undefined);

    expect(calls.setOptions[0]?.enabled).toBe(false);
    expect(calls.disable).toEqual([7]);
  });

  it('says why the icon is greyed out', async () => {
    await applyTabScope(7, 'https://example.com/');

    // A disabled panel with a lit icon is a click that does nothing, which
    // reads as a broken extension. The tooltip has to answer instead.
    expect(calls.setTitle[0]?.title).toMatch(/pubmed/i);
    expect(calls.disable).toEqual([7]);
  });

  it('restores the ordinary title on a PubMed tab', async () => {
    await applyTabScope(7, 'https://pubmed.ncbi.nlm.nih.gov/36577095/');

    expect(calls.setTitle).toEqual([{ tabId: 7, title: 'Open Journal Club Helper' }]);
  });
});

describe('scopeAllTabs', () => {
  it('scopes every open tab after an install or a restart', async () => {
    install([
      { id: 1, url: 'https://pubmed.ncbi.nlm.nih.gov/36577095/' },
      { id: 2, url: undefined },
      { id: 3, url: 'https://example.com/' },
    ]);

    await scopeAllTabs();

    expect(calls.setOptions).toHaveLength(3);
    expect(calls.enable).toEqual([1]);
    expect(calls.disable.sort()).toEqual([2, 3]);
  });

  it('skips a tab with no usable id', async () => {
    // chrome.tabs.TAB_ID_NONE is -1, and setOptions rejects on it.
    install([{ id: -1, url: 'https://example.com/' }, { url: 'https://example.com/' }]);

    await scopeAllTabs();

    expect(calls.setOptions).toEqual([]);
    expect(calls.disable).toEqual([]);
  });
});
