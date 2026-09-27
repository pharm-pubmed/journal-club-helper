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
