// @vitest-environment happy-dom
/**
 * The Numbers tab on a case-control study (#58): the design caveat sits above
 * the candidates and beside a Rates or Counts result, never beside a Ratio one,
 * and it follows the design in force as the reader overrides it. Nothing is
 * removed or refused on its account.
 *
 * The tab, the store and every src/lib module are the real ones; only the
 * article and its detected design are made up. src/lib/design-caveats.ts is
 * tested for its wording in tests/lib/design-caveats.test.ts, so this file
 * checks placement only.
 */
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { PubMedArticle, StudyDesign } from '../../src/lib/types';
import { applyPreference } from '../../src/ui/i18n';
import { actions, initialState, store } from '../../src/ui/store';
import { NumbersTab } from '../../src/ui/tabs/NumbersTab';

const CASE_CONTROL = 'A case-control study samples on the outcome';
const CROSS_SECTIONAL = 'A cross-sectional study measures prevalence at one point in time';

/** One fraction pair and one odds ratio, as a case-control abstract reports them. */
const ARTICLE: PubMedArticle = {
  pmid: '99999998',
  title: 'An exposure and a rare tumour',
  abstract:
    'Exposure among cases and controls was 40/200 (20.0%) vs 20/200 (10.0%) ' +
    '(odds ratio 2.25, 95% confidence interval 1.27 to 3.99).',
  abstractSections: [],
  publicationTypes: [],
  meshTerms: [],
  authors: [],
  journal: '',
  year: '',
  doi: null,
  source: 'dom',
};

async function mount(design: StudyDesign): Promise<void> {
  await act(() => {
    actions.setArticle(ARTICLE);
    actions.setClassification({ design, subtype: null, confidence: 'medium', evidence: [] });
    render(h(NumbersTab, null), document.body);
  });
}

/** The candidates block, from its heading down to the end of the list. */
function candidatesBlock(): string {
  return document.querySelector('[aria-labelledby="jch-numbers-candidates"]')?.textContent ?? '';
}

function resultBlock(): string {
  return document.querySelector('.numbers__result')?.textContent ?? '';
}

async function use(raw: string): Promise<void> {
  const item = [...document.querySelectorAll('.numbers__candidate')].find((li) =>
    li.querySelector('.numbers__raw')?.textContent?.startsWith(raw),
  );
  if (!item) throw new Error(`no candidate starting "${raw}"`);
  await act(() => item.querySelector<HTMLButtonElement>('.numbers__use')?.click());
}

async function calculateWithAcr(percent: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('#jch-numbers-acr');
  if (!input) throw new Error('no ACR field');
  await act(() => {
    input.value = percent;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => document.querySelector<HTMLButtonElement>('.numbers__submit')?.click());
}

beforeEach(() => {
  store.set({ ...initialState() });
});

afterEach(() => {
  render(null, document.body);
});

it('puts the caveat above the candidates on a case-control study, and keeps every candidate', async () => {
  await mount('case-control');

  const block = candidatesBlock();
  expect(block).toContain(CASE_CONTROL);
  expect(block.indexOf(CASE_CONTROL)).toBeLessThan(block.indexOf('40/200'));
  expect(document.querySelectorAll('.numbers__candidate')).toHaveLength(2);
});

it('repeats it beside a Counts result, which is still calculated', async () => {
  await mount('case-control');
  await use('40/200');

  const result = resultBlock();
  expect(result).toContain('NNH 10');
  expect(result).toContain(CASE_CONTROL);
  // Straight after the sentence it qualifies, ahead of the figures.
  expect(result.indexOf(CASE_CONTROL)).toBeLessThan(result.indexOf('Control event rate'));
});

it('leaves a Ratio result without it, while the note above the candidates stays', async () => {
  await mount('case-control');
  await use('odds ratio 2.25');
  await calculateWithAcr('1');

  expect(resultBlock()).toContain('NNH');
  expect(resultBlock()).not.toContain(CASE_CONTROL);
  expect(candidatesBlock()).toContain(CASE_CONTROL);
});

it('follows a design override in both places', async () => {
  await mount('case-control');
  await use('40/200');
  expect(resultBlock()).toContain(CASE_CONTROL);

  await act(() => actions.setDesignOverride('cohort'));
  expect(candidatesBlock()).not.toContain(CASE_CONTROL);
  expect(resultBlock()).not.toContain(CASE_CONTROL);
  expect(resultBlock()).toContain('NNH 10');

  await act(() => actions.setDesignOverride(null));
  expect(candidatesBlock()).toContain(CASE_CONTROL);
  expect(resultBlock()).toContain(CASE_CONTROL);
});

it('gives a cross-sectional result the milder note, and says nothing above its candidates', async () => {
  await mount('cross-sectional');
  expect(document.body.textContent).not.toContain(CROSS_SECTIONAL);

  await use('40/200');
  expect(resultBlock()).toContain(CROSS_SECTIONAL);
  expect(resultBlock()).not.toContain(CASE_CONTROL);
  expect(candidatesBlock()).not.toContain(CROSS_SECTIONAL);
});

it('adds nothing to a trial', async () => {
  await mount('rct');
  await use('40/200');

  expect(resultBlock()).toContain('NNH 10');
  expect(document.body.textContent).not.toContain(CASE_CONTROL);
  expect(document.body.textContent).not.toContain(CROSS_SECTIONAL);
});

/* -------------------------------------------------------------- Japanese (#82) */

/** Latin words a Japanese panel may show: notation, abbreviations and names. */
const LATIN_ALLOWED = new Set(
  'NNT NNH NNTB NNTH ARR ARI RRR RRI CER EER ACR RR HR OR CI Wald Cochrane Handbook CEBM Oxford'.split(
    ' ',
  ),
);

/** Latin words in the tab that are not on the list, outside the abstract's own text. */
function strayLatin(): string[] {
  const root = document.querySelector('.numbers');
  if (!root) return ['no tab'];
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.numbers__raw, .numbers__sentence').forEach((node) => node.remove());
  const words = (clone.textContent ?? '').match(/[A-Za-z]{2,}/g) ?? [];
  return words.filter((word) => !LATIN_ALLOWED.has(word));
}

async function fill(id: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`no field ${id}`);
  await act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function switchTo(locale: 'en' | 'ja'): Promise<void> {
  await act(() => applyPreference(locale));
}

it('shows no English words in Japanese, with results, a crossing interval and errors', async () => {
  await mount('case-control');
  await switchTo('ja');
  try {
    document.querySelectorAll('details').forEach((details) => {
      details.open = true;
    });
    expect(strayLatin()).toEqual([]);

    await use('40/200');
    expect(resultBlock()).toContain('症例対照研究');
    expect(strayLatin()).toEqual([]);

    // RR 0.8 (0.64–1.00): one end of the NNT interval at infinity.
    await use('odds ratio 2.25');
    await act(() => {
      const select = document.querySelector<HTMLSelectElement>('#jch-numbers-measure');
      if (!select) throw new Error('no measure');
      select.value = 'RR';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await fill('jch-numbers-estimate', '0.8');
    await fill('jch-numbers-ci-low', '0.64');
    await fill('jch-numbers-ci-high', '1');
    await calculateWithAcr('20');
    expect(document.querySelector('.numbers__nnt')?.textContent).toBe(
      'NNT 25（95% 信頼区間 NNTB 14 〜 ∞）',
    );
    expect(strayLatin()).toEqual([]);

    await fill('jch-numbers-estimate', '');
    await act(() => document.querySelector<HTMLButtonElement>('.numbers__submit')?.click());
    expect(document.querySelector('#jch-numbers-estimate-error')?.textContent).toContain(
      '入力してください',
    );
    expect(strayLatin()).toEqual([]);
  } finally {
    await switchTo('en');
  }
});

// An error found in one language is written again in the other when the reader switches.
it('rewrites an error on screen when the language changes', async () => {
  await mount('rct');
  await act(() => document.querySelector<HTMLButtonElement>('.numbers__submit')?.click());
  const error = () => document.querySelector('#jch-numbers-control-events-error')?.textContent;
  expect(error()).toBe('Control events is required.');
  await switchTo('ja');
  try {
    expect(error()).toBe('対照群のイベント数を入力してください。');
  } finally {
    await switchTo('en');
  }
  expect(error()).toBe('Control events is required.');
});
