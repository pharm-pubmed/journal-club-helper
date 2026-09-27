/**
 * The appraisal that the store images (capture.spec.ts) and the landing
 * page's demo video (demo.spec.ts) both show, and the steps they share. The
 * PubMed page is the saved copy of a real public abstract: the BMJ
 * meta-analysis in tests/e2e/pmids.ts.
 */
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect } from '../tests/e2e/fixtures';
import { META_ANALYSIS } from '../tests/e2e/pmids';

export const RECORD = META_ANALYSIS;
export const PANEL = { width: 400, height: 720 };

/** What the reader enters. All of it is from the abstract of PMID 36740866. */
export const PICO = {
  p: 'Non-intubated adults with hypoxemic respiratory failure due to covid-19',
  i: 'Awake prone positioning',
  c: 'Usual care',
  o: 'Endotracheal intubation',
};
/** The ratio the extractor offers first, and the usual-care rate it is applied to. */
export const RATIO_RAW = 'relative risk 0.83, 95% confidence interval 0.73 to 0.94';
export const BASELINE_RISK = '29.8';
export const EXPECTED_NNT = 'NNT 20 (95% CI 13–56)';
export const REGISTRATION_NOTE =
  'PROSPERO CRD42022314856 is named. Check that it was registered before the last search, 4 March 2022.';
export const SEARCH_NOTE =
  'Three databases are named. Trial registries and unpublished data are not mentioned: check the methods.';
export const BOTTOM_LINE =
  'Pooled trials show fewer intubations with awake prone positioning, and no clear effect on mortality. ' +
  'How the trials differed in setting and adherence needs the full text.';

/** Drops the focus ring the last field typed in would otherwise show. */
export async function blur(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/**
 * Opens the panel's page in a tab, showing the PubMed tab's article. `init`,
 * when given, runs in the page before the panel's own script.
 */
export async function openPanelInTab(
  context: BrowserContext,
  extensionId: string,
  init?: () => void,
): Promise<Page> {
  const panel = await context.newPage();
  await panel.setViewportSize(PANEL);
  // The e2e fixtures abort every request that is not PubMed, the panel's own
  // files included once it is in a tab.
  await panel.route(/^chrome-extension:/, (route) => route.continue());
  await panel.addInitScript((pmid) => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (() =>
      query({
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/*`,
      })) as unknown as typeof chrome.tabs.query;
  }, RECORD.pmid);
  if (init) await panel.addInitScript(init);
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.locator('body')).toContainText(`PMID ${RECORD.pmid}`);
  return panel;
}

export async function tab(panel: Page, name: string): Promise<void> {
  await panel.getByRole('tab', { name, exact: true }).click();
}

/** A checklist item by its concept label, so a reordered checklist cannot move an answer. */
export function item(panel: Page, concept: string): Locator {
  return panel
    .locator('.validity-item')
    .filter({ has: panel.locator('.validity-item__concept', { hasText: concept }) });
}
