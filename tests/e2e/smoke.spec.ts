/**
 * Smoke tests for the built extension in a real Chromium (#24). See
 * fixtures.ts for why CI serves saved pages and the live run is by hand.
 *
 * Everything asserted comes out of the build: the article from the content
 * script's GET_ARTICLE answer, the design and the NNT from what the side panel
 * renders. Nothing is recomputed from src/ here, so a stale build cannot hide
 * behind current source.
 */
import type { Page } from '@playwright/test';
import type { PubMedArticle } from '../../src/lib/types';
import { DESIGN_LABELS } from '../../src/ui/labels';
import { LIVE, evaluateInPanel, expect, getArticle, openPubMed, test } from './fixtures';
import { RCT, RCT_PERCENT_PAIR, RECORDS, SEARCH_URL, articleUrl, type SmokeRecord } from './pmids';

const BUTTON_MISSING =
  'The Journal Club button did not appear. Either the content script did not run, or it ' +
  'found no Abstract heading to attach to (findAnchor in src/entrypoints/content.ts).';

const EXTRACTION_FAILED = LIVE
  ? 'The page loaded and the button was added, but extraction returned nothing: PubMed ' +
    'markup has probably changed. See src/lib/pubmed-dom.ts and HANDOVER §5.'
  : 'Extraction returned nothing from a saved page whose markup has not changed, so the ' +
    'extraction code regressed. See src/lib/pubmed-dom.ts.';

/** Opens the record and returns what the content script read from it. */
async function readRecord(
  page: Page,
  serviceWorker: Parameters<typeof getArticle>[0],
  record: SmokeRecord,
): Promise<PubMedArticle> {
  const url = articleUrl(record);
  await openPubMed(page, url, 'article');
  // The listener is registered before the button is added, so a visible
  // button means GET_ARTICLE has someone to answer it.
  await expect(page.locator('#jch-open'), BUTTON_MISSING).toBeVisible();
  const { article } = await getArticle(serviceWorker, url);
  expect(article, `PMID ${record.pmid}: ${EXTRACTION_FAILED}`).not.toBeNull();
  return article as PubMedArticle;
}

/** Clicks the button and waits for the panel to show this record. */
async function openPanel(page: Page, extensionId: string, record: SmokeRecord): Promise<void> {
  await page.locator('#jch-open').click();
  await expect
    .poll(
      () =>
        evaluateInPanel<string>(page, extensionId, 'document.body.innerText').catch(
          (error: Error) => error.message,
        ),
      { message: 'the side panel did not open on this article' },
    )
    .toContain(`PMID ${record.pmid}`);
}

test('1. the button appears on an abstract page, not on search results, and opens the panel', async ({
  context,
  page,
  extensionId,
}) => {
  await openPubMed(page, SEARCH_URL, 'search');

  // A second tab, loaded after the first: once the button is in this one, the
  // content script has had every chance to act on the search page too, which
  // is what makes the absence check below mean something.
  const abstractPage = await context.newPage();
  await openPubMed(abstractPage, articleUrl(RCT), 'article');
  const button = abstractPage.locator('#jch-open');
  await expect(button, BUTTON_MISSING).toBeVisible();
  await expect(button).toHaveText('Journal Club');
  // The last child of the Abstract heading, so it sits beside it, and only once.
  await expect(
    abstractPage.locator('#abstract :is(h2, .title) > #jch-open:last-child'),
  ).toHaveCount(1);
  await expect(abstractPage.locator('#jch-open')).toHaveCount(1);

  await expect(page.locator('#jch-open')).toHaveCount(0);

  // The content script → background → sidePanel.open() hop.
  await openPanel(abstractPage, extensionId, RCT);
});

for (const record of RECORDS) {
  test(`2. GET_ARTICLE reads PMID ${record.pmid} and the panel classifies it as ${record.design}`, async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const article = await readRecord(page, serviceWorker, record);

    expect(article.title.length, 'title').toBeGreaterThan(20);
    expect(article.publicationTypes.length, 'publication types').toBeGreaterThanOrEqual(1);
    expect(article.abstract.length, 'abstract length').toBeGreaterThan(200);
    expect(article.doi, 'DOI').toBe(record.doi);
    expect(article.journal, 'journal').toBe(record.journal);
    expect(article.year, 'year').toBe(record.year);
    expect(article.authors[0], 'first author').toBe(record.firstAuthor);

    await openPanel(page, extensionId, record);
    const panelText = await evaluateInPanel<string>(page, extensionId, 'document.body.innerText');
    expect(panelText).toContain(`Study design: ${DESIGN_LABELS[record.design]}`);
  });
}

test('3. the panel turns the percent pair in the abstract into an NNT', async ({
  page,
  serviceWorker,
  extensionId,
}) => {
  await readRecord(page, serviceWorker, RCT);
  await openPanel(page, extensionId, RCT);

  // Runs in the panel: open the Numbers tab, press Use on the pair, and read
  // what the calculator shows. Returns why it could not, rather than throwing,
  // so the poll below reports the last reason.
  const useThePair = `(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Numbers');
    if (!tab) return 'no Numbers tab';
    tab.click();
    const item = [...document.querySelectorAll('.numbers__candidate')].find(
      (li) => li.querySelector('.numbers__raw')?.textContent === ${JSON.stringify(RCT_PERCENT_PAIR.raw)},
    );
    if (!item) {
      const found = [...document.querySelectorAll('.numbers__raw')].map((el) => el.textContent);
      return 'candidate not listed; found: ' + JSON.stringify(found);
    }
    item.querySelector('.numbers__use').click();
    return document.querySelector('.numbers__nnt')?.textContent ?? 'no NNT shown';
  })()`;
  await expect
    .poll(() => evaluateInPanel<string>(page, extensionId, useThePair), {
      message: `the Numbers tab did not produce an NNT from ${RCT_PERCENT_PAIR.raw}`,
    })
    .toBe(RCT_PERCENT_PAIR.nnt);
});

test('4. an edit made just before the panel closes is there when it reopens', async ({
  page,
  serviceWorker,
  extensionId,
}) => {
  await readRecord(page, serviceWorker, RCT);
  await openPanel(page, extensionId, RCT);

  // Runs in the panel: switch to the Export tab and read the bottom line. The
  // tab renders on the next frame, so callers poll until the field is there.
  const readBottomLine = `(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Export');
    if (!tab) return 'no Export tab';
    tab.click();
    const field = document.querySelector('.export__textarea');
    return field ? 'field: ' + field.value : 'no bottom-line field';
  })()`;
  await expect
    .poll(() => evaluateInPanel<string>(page, extensionId, readBottomLine))
    .toMatch(/^field: /);

  // Autosave is debounced, and closing the panel destroys its document without
  // unmounting it, so this edit is still pending when the panel goes.
  const bottomLine = `Written just before closing, ${Date.now()}`;
  const typeAndClose = `(() => {
    const field = document.querySelector('.export__textarea');
    field.value = ${JSON.stringify(bottomLine)};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => window.close(), 0);
    return 'closing';
  })()`;
  expect(await evaluateInPanel<string>(page, extensionId, typeAndClose)).toBe('closing');
  await expect
    .poll(() =>
      evaluateInPanel<string>(page, extensionId, '1').catch((error: Error) => error.message),
    )
    .toContain('not open');

  await openPanel(page, extensionId, RCT);
  await expect
    .poll(() => evaluateInPanel<string>(page, extensionId, readBottomLine), {
      message: 'the edit made just before the panel closed was not restored',
    })
    .toBe(`field: ${bottomLine}`);
});
