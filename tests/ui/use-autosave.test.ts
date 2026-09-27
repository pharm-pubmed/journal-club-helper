// @vitest-environment happy-dom
/**
 * The side panel after Settings deletes or imports appraisals under it: it has
 * to drop what it holds in memory and read storage again, or its next edit
 * writes the old appraisal back.
 *
 * `chrome.runtime.onMessage` is a fake that hands the test the panel's
 * listener; the hook, the store and `src/lib/storage.ts` over an in-memory
 * store are the real ones. Smoke scenario 6 covers the same thing end to end,
 * but only fake timers can hold an edit inside the debounce while the message
 * arrives.
 */
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMemoryStore,
  resetStore,
  setStore,
  type KeyValueStore,
} from '../../src/lib/kv-store';
import { appraisalKey, deleteAllAppraisals, saveAppraisal } from '../../src/lib/storage';
import type { Appraisal, PubMedArticle } from '../../src/lib/types';
import { AUTOSAVE_DEBOUNCE_MS, useAutosave } from '../../src/ui/hooks/useAutosave';
import { actions, initialState, store } from '../../src/ui/store';

const PMID = '36577095';

const ARTICLE: PubMedArticle = {
  pmid: PMID,
  title: 'A trial',
  abstract: 'a',
  abstractSections: [],
  publicationTypes: [],
  meshTerms: [],
  authors: [],
  journal: '',
  year: '',
  doi: null,
  source: 'dom',
};

type Listener = (message: unknown) => unknown;

let kv: KeyValueStore;
let listeners: Listener[];
const saved: Appraisal[] = [];

function Probe() {
  useAutosave({
    save: async (appraisal) => {
      saved.push(appraisal);
      await saveAppraisal(appraisal);
    },
  });
  return null;
}

async function settle(): Promise<void> {
  for (let n = 0; n < 5; n++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
  }
}

function announce(): void {
  act(() => {
    for (const listener of listeners) listener({ type: 'APPRAISALS_REPLACED' });
  });
}

async function stored(): Promise<Appraisal | undefined> {
  return kv.get<Appraisal>(appraisalKey(PMID));
}

/** Binds the article with a saved bottom line, as a reopened panel would. */
async function openWithSaved(bottomLine: string): Promise<void> {
  await kv.set(appraisalKey(PMID), {
    schemaVersion: 2,
    pmid: PMID,
    createdAt: 1_000,
    updatedAt: 1_000,
    citation: { title: 'A trial', authors: [], journal: '', year: '', doi: null },
    designDetected: null,
    designOverride: null,
    subtypeOverride: null,
    pico: { p: 'adults', i: '', c: '', o: '' },
    numbers: null,
    validity: {},
    sourceScope: 'abstract',
    info: {},
    bottomLine,
    discussionQuestions: [],
  } satisfies Appraisal);
  store.set({ ...initialState() });
  actions.setArticle(ARTICLE);
  await act(() => {
    render(h(Probe, null), document.body);
  });
  await settle();
  expect(store.get().bottomLine).toBe(bottomLine);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  kv = createMemoryStore();
  setStore(kv);
  listeners = [];
  saved.length = 0;
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: (fn: Listener) => listeners.push(fn),
        removeListener: (fn: Listener) => {
          listeners = listeners.filter((listener) => listener !== fn);
        },
      },
    },
  });
});

afterEach(() => {
  render(null, document.body);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetStore();
});

it('drops an edit still inside the debounce when everything is deleted, and does not write it back', async () => {
  await openWithSaved('Before the delete');
  act(() => actions.setBottomLine('Before the delete, and one more word'));
  // The effect that schedules the write has run; the write itself has not.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(saved).toHaveLength(0);

  await deleteAllAppraisals();
  announce();
  await settle();

  expect(saved).toHaveLength(0);
  expect(await stored()).toBeUndefined();
  // A fresh, empty form for the same article.
  expect(store.get().article).toBe(ARTICLE);
  expect(store.get().bottomLine).toBe('');
  expect(store.get().pico.p).toBe('');

  act(() => actions.setPicoField('I', 'drug'));
  await settle();
  const after = await stored();
  expect(after?.pico).toEqual({ p: '', i: 'drug', c: '', o: '' });
  expect(after?.bottomLine).toBe('');
});

it('shows the imported copy after an import, and its next edit keeps it', async () => {
  await openWithSaved('Stale copy in the panel');
  act(() => actions.setBottomLine('Stale copy in the panel, edited'));

  const imported = { ...(await stored())!, bottomLine: 'From the backup', updatedAt: 2_000 };
  await kv.set(appraisalKey(PMID), imported);
  announce();
  await settle();

  expect(saved).toHaveLength(0);
  expect(store.get().bottomLine).toBe('From the backup');

  act(() => actions.setPicoField('I', 'drug'));
  await settle();
  const after = await stored();
  expect(after?.bottomLine).toBe('From the backup');
  expect(after?.pico.i).toBe('drug');
});

it('ignores other messages', async () => {
  await openWithSaved('Kept');
  act(() => actions.setBottomLine('Kept, edited'));
  act(() => {
    for (const listener of listeners) listener({ type: 'GET_ARTICLE' });
  });
  await settle();
  expect((await stored())?.bottomLine).toBe('Kept, edited');
});
