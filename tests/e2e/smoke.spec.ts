/**
 * Smoke tests for the built extension in a real Chromium (#24). See
 * fixtures.ts for why CI serves saved pages and the live run is by hand.
 */
import { classifyDesign } from '../../src/lib/design-classifier';
import { fromRates } from '../../src/lib/effect-measures';
import { extractNumberCandidates } from '../../src/lib/number-extractor';
import type { PercentPairCandidate, PubMedArticle } from '../../src/lib/types';
import { expect, getArticle, openDocumentUrls, openPubMed, test } from './fixtures';
import { RCT, RECORDS, SEARCH_URL, articleUrl, type SmokeRecord } from './pmids';

/**
 * Opens the record and returns what the content script read from it. Fails
 * with a message that says where to look, because "expected null not to be
 * null" is what the first PubMed markup change would otherwise print.
 */
async function readRecord(
  page: Parameters<typeof openPubMed>[0],
  serviceWorker: Parameters<typeof getArticle>[0],
  record: SmokeRecord,
): Promise<PubMedArticle> {
  const url = articleUrl(record);
  await openPubMed(page, url);
  // The listener is registered before the button is added, so a visible
  // button means GET_ARTICLE has someone to answer it.
  await expect(page.locator('#jch-open')).toBeVisible();
  const { article } = await getArticle(serviceWorker, url);
  expect(
    article,
    `GET_ARTICLE returned no article for PMID ${record.pmid}. The page loaded and the ` +
      'button was added, so extraction failed: PubMed markup has probably changed. ' +
      'See src/lib/pubmed-dom.ts and HANDOVER §5.',
  ).not.toBeNull();
  return article as PubMedArticle;
}

test('1. the button appears on an abstract page, not on search results, and opens the panel', async ({
  context,
  page,
  extensionId,
}) => {
  await openPubMed(page, SEARCH_URL);

  // A second tab, loaded after the first: once the button is in this one, the
  // content script has had every chance to act on the search page too, which
  // is what makes the absence check below mean something.
  const abstractPage = await context.newPage();
  await openPubMed(abstractPage, articleUrl(RCT));
  const button = abstractPage.locator('#jch-open');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Journal Club');
  // Beside the Abstract heading, as the last child of it, and only once.
  await expect(abstractPage.locator('#abstract #jch-open')).toHaveCount(1);

  await page.waitForLoadState('load');
  await expect(page.locator('#jch-open')).toHaveCount(0);

  await button.click();
  // The panel is browser UI, not a Playwright page; its document shows up as a
  // CDP target. This is the content script → background → sidePanel.open() hop.
  const panelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
  await expect
    .poll(() => openDocumentUrls(abstractPage), { message: 'the side panel did not open' })
    .toContain(panelUrl);
});

for (const record of RECORDS) {
  test(`2. GET_ARTICLE reads PMID ${record.pmid} and it classifies as ${record.design}`, async ({
    page,
    serviceWorker,
  }) => {
    const article = await readRecord(page, serviceWorker, record);

    expect(article.pmid).toBe(record.pmid);
    expect(article.title.length, 'title').toBeGreaterThan(20);
    expect(article.publicationTypes.length, 'publication types').toBeGreaterThanOrEqual(1);
    expect(article.abstract.length, 'abstract length').toBeGreaterThan(200);
    expect(article.doi, 'DOI').toBe(record.doi);
    expect(classifyDesign(article).design).toBe(record.design);
  });
}

test('3. a percent pair in the abstract yields a candidate and an NNT', async ({
  page,
  serviceWorker,
}) => {
  const article = await readRecord(page, serviceWorker, RCT);

  const pairs = extractNumberCandidates(article.abstract).filter(
    (candidate): candidate is PercentPairCandidate => candidate.kind === 'percent-pair',
  );
  expect(pairs.length, 'percent-pair candidates in the abstract').toBeGreaterThanOrEqual(1);

  // The panel lets the reader say which arm is the control; the NNT depends on
  // |ARR| only, so either assignment gives the same number.
  const pair = pairs[0] as PercentPairCandidate;
  const measures = fromRates(pair.first / 100, pair.second / 100);
  expect(measures.nnt, `NNT from ${pair.raw}`).not.toBeNull();
  expect(measures.nnt).toBeGreaterThan(0);
});
