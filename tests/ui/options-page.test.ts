// @vitest-environment happy-dom
/**
 * Settings → Delete all and Import, as the page drives them: records this
 * version cannot read are counted, deletable when they are all there is, and
 * every change to the appraisals is announced to any open side panel.
 *
 * `chrome.runtime.sendMessage` is a fake; the page and `src/lib/storage.ts`
 * over an in-memory store are the real ones.
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
import {
  EXPORT_SCHEMA_VERSION,
  SETTINGS_KEY,
  UNREADABLE_PREFIX,
  appraisalKey,
} from '../../src/lib/storage';
import type { Appraisal } from '../../src/lib/types';
import { applyPreference } from '../../src/ui/i18n';
import { OptionsPage } from '../../src/ui/options/OptionsPage';

const SETTINGS = { schemaVersion: 1, counters: { panelOpens: 3, exports: 1, aiRuns: 0 } };
const REPLACED = { type: 'APPRAISALS_REPLACED' };

let kv: KeyValueStore;
const sendMessage = vi.fn(async () => undefined);

function appraisal(pmid: string): Appraisal {
  return {
    schemaVersion: 2,
    pmid,
    createdAt: 1_000,
    updatedAt: 1_000,
    citation: { title: `Trial ${pmid}`, authors: [], journal: '', year: '', doi: null },
    designDetected: null,
    designOverride: null,
    subtypeOverride: null,
    pico: { p: '', i: '', c: '', o: '' },
    numbers: null,
    validity: {},
    sourceScope: 'abstract',
    info: {},
    bottomLine: '',
    discussionQuestions: [],
  };
}

/** The page reads storage asynchronously; this lets every pending read land. */
async function settle(): Promise<void> {
  for (let n = 0; n < 5; n++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

async function click(label: string): Promise<void> {
  await act(() => button(label).click());
  await settle();
}

function status(): string {
  return document.querySelector('[role="status"]')?.textContent ?? '';
}

async function mount(): Promise<void> {
  await act(() => {
    render(h(OptionsPage, null), document.body);
  });
  await settle();
}

beforeEach(() => {
  kv = createMemoryStore();
  setStore(kv);
  sendMessage.mockClear();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
});

afterEach(() => {
  render(null, document.body);
  // The language is module state; a failed test must not leave it Japanese.
  applyPreference('auto');
  vi.unstubAllGlobals();
  resetStore();
});

it('deletes records this version could not read when they are all there is', async () => {
  await kv.set(`${UNREADABLE_PREFIX}33333333`, { schemaVersion: 1 });
  await kv.set(appraisalKey('44444444'), { ...appraisal('44444444'), schemaVersion: 1 });
  await kv.set(SETTINGS_KEY, SETTINGS);
  await mount();

  expect(document.body.textContent).toContain(
    'Also stored here: 2 records this version could not read.',
  );
  expect(document.body.textContent).not.toContain('Nothing saved yet');
  expect(button('Delete all appraisals').disabled).toBe(false);

  await click('Delete all appraisals');
  expect(document.querySelector('.options__confirm-text')?.textContent).toMatch(
    /^Delete 2 records this version could not read\?/,
  );
  await click('Yes, delete everything');

  expect(status()).toBe(
    'Deleted 2 records this version could not read. The usage counts below were kept.',
  );
  expect(Object.keys(await kv.getAll())).toEqual([SETTINGS_KEY]);
  expect(sendMessage).toHaveBeenCalledWith(REPLACED);
  expect(button('Delete all appraisals').disabled).toBe(true);
});

it('names both kinds when there are readable and unreadable records', async () => {
  await kv.set(appraisalKey('11111111'), appraisal('11111111'));
  await kv.set(`${UNREADABLE_PREFIX}33333333`, { schemaVersion: 1 });
  await mount();

  await click('Delete all appraisals');
  expect(document.querySelector('.options__confirm-text')?.textContent).toMatch(
    /^Delete 1 saved appraisal and 1 record this version could not read\?/,
  );
  await click('Yes, delete everything');
  expect(status()).toBe(
    'Deleted 1 appraisal and 1 record this version could not read. The usage counts below were kept.',
  );
  expect(await kv.getAll()).toEqual({});
});

it('keeps the button disabled and says nothing extra when nothing is stored', async () => {
  await mount();
  expect(button('Delete all appraisals').disabled).toBe(true);
  expect(document.body.textContent).toContain('Nothing saved yet');
  expect(document.body.textContent).not.toContain('could not read');
});

it('announces an import to any open side panel', async () => {
  await mount();
  const file = new File(
    [
      JSON.stringify({
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: new Date(0).toISOString(),
        appraisals: [appraisal('11111111')],
        settings: SETTINGS,
      }),
    ],
    'backup.json',
    { type: 'application/json' },
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(() => {
    input.dispatchEvent(new Event('change'));
  });
  await settle();

  expect(status()).toBe('Imported 1 appraisal.');
  expect(sendMessage).toHaveBeenCalledWith(REPLACED);
});

// #82: the language choice is stored with the counters, and the page switches
// at once instead of waiting for storage to report the write.
it('switches the page to Japanese and stores the choice', async () => {
  await kv.set(SETTINGS_KEY, SETTINGS);
  await mount();
  expect(document.body.textContent).toContain('Your data');

  const japanese = [...document.querySelectorAll<HTMLInputElement>('input[name="locale"]')].find(
    (input) => input.value === 'ja',
  );
  if (!japanese) throw new Error('no Japanese option');
  await act(() => japanese.click());
  await settle();

  expect(document.body.textContent).toContain('保存データ');
  expect(document.body.textContent).not.toContain('Your data');
  expect(await kv.get(SETTINGS_KEY)).toEqual({ ...SETTINGS, locale: 'ja' });
});
