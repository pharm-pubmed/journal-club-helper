/**
 * Renders the store listing images (#27) from the built extension:
 * `pnpm store:assets`. Not part of the test run and not in CI.
 *
 * Every panel image is the real build on the saved page of a real public
 * abstract: the BMJ meta-analysis in tests/e2e/pmids.ts. The reader's input is
 * entered through the panel's own controls. The captions and the frame around
 * each image are added afterwards. Three panel images are also kept unframed
 * for the landing page, in site/img, and the summary the Export tab downloads
 * is saved as the site's example output, in site/sample.
 *
 * Playwright cannot screenshot the side panel, which is browser UI, so the
 * panel's page is opened in an ordinary tab instead. One thing is changed to
 * make that work: the panel asks for the active tab, which would be itself, so
 * its `chrome.tabs.query` is pointed at the PubMed tab. The content script
 * there answers exactly as it does for the real panel.
 *
 * The PubMed page itself is left out, so no NLM or HHS branding appears in the
 * listing. The fonts are whatever `system-ui` is on the machine that renders
 * the images, so a re-run elsewhere changes every PNG slightly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { LIVE, expect, openPubMed, test } from '../tests/e2e/fixtures';
import { META_ANALYSIS, articleUrl } from '../tests/e2e/pmids';

const RECORD = META_ANALYSIS;
const PANEL = { width: 400, height: 720 };
const OPTIONS = { width: 720, height: 720 };
/** The landing page (#29) shows three of the panel images unframed. */
const SITE_IMAGES = 'site/img';
const ICON = `data:image/svg+xml;base64,${readFileSync('store/icon.svg').toString('base64')}`;

/** What the reader enters. All of it is from the abstract of PMID 36740866. */
const PICO = {
  p: 'Non-intubated adults with hypoxemic respiratory failure due to covid-19',
  i: 'Awake prone positioning',
  c: 'Usual care',
  o: 'Endotracheal intubation',
};
/** The ratio the extractor offers first, and the usual-care rate it is applied to. */
const RATIO_RAW = 'relative risk 0.83, 95% confidence interval 0.73 to 0.94';
const BASELINE_RISK = '29.8';
const EXPECTED_NNT = 'NNT 20 (95% CI 13–56)';
const SEARCH_NOTE =
  'Three databases are named. Trial registries and unpublished data are not mentioned: check the methods.';
const BOTTOM_LINE =
  'Pooled trials show fewer intubations with awake prone positioning, and no clear effect on mortality. ' +
  'How the trials differed in setting and adherence needs the full text.';

/** Fills a field. `fill` fires the input event Preact listens for. */
async function type(page: Page, selector: string, text: string): Promise<void> {
  await page.locator(selector).fill(text);
}

/** Screenshots the panel, keeping an unframed copy for the landing page when `site` is named. */
async function shoot(page: Page, site?: string): Promise<Buffer> {
  const shot = await page.screenshot();
  if (site) writeFileSync(`${SITE_IMAGES}/${site}.png`, shot);
  return shot;
}

/** Drops the focus ring the last field typed in would otherwise show. */
async function blur(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function openPanelInTab(context: BrowserContext, extensionId: string): Promise<Page> {
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
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.locator('body')).toContainText(`PMID ${RECORD.pmid}`);
  return panel;
}

async function tab(panel: Page, name: string): Promise<void> {
  await panel.getByRole('tab', { name, exact: true }).click();
}

/** A checklist item by its concept label, so a reordered checklist cannot move an answer. */
function item(panel: Page, concept: string): Locator {
  return panel
    .locator('.validity-item')
    .filter({ has: panel.locator('.validity-item__concept', { hasText: concept }) });
}

/** Frames `shot` at 1280×800 beside its caption, and writes it to `path`. */
async function frame(
  context: BrowserContext,
  path: string,
  shot: Buffer,
  size: { width: number; height: number },
  caption: string,
  detail: string,
): Promise<void> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const image = `data:image/png;base64,${shot.toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 1280px; height: 800px; overflow: hidden;
      font-family: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #0b5c6b 0%, #0f7385 100%); color: #fff;
      display: flex; align-items: center; justify-content: space-between; padding: 0 72px;
      box-sizing: border-box; }
    .copy { max-width: ${1280 - 144 - size.width - 64}px; }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 600;
      opacity: .92; margin-bottom: 40px; }
    .brand img { width: 44px; height: 44px; border-radius: 10px; box-shadow: 0 0 0 2px #ffffff33; }
    h1 { font-size: 46px; line-height: 1.15; margin: 0 0 20px; font-weight: 700; letter-spacing: -.01em; }
    p { font-size: 22px; line-height: 1.45; margin: 0; color: #d5ecef; }
    .shot { width: ${size.width}px; height: ${size.height}px; border-radius: 12px; overflow: hidden;
      box-shadow: 0 24px 60px #00000055, 0 0 0 1px #00000022; background: #fff; }
    .shot img { width: 100%; height: 100%; display: block; }
  </style></head><body>
    <div class="copy">
      <div class="brand"><img src="${ICON}" alt="">Journal Club Helper</div>
      <h1>${caption}</h1>
      <p>${detail}</p>
    </div>
    <div class="shot"><img src="${image}" alt=""></div>
  </body></html>`);
  await page.locator('.shot img').evaluate((img: HTMLImageElement) => img.decode());
  writeFileSync(path, await page.screenshot());
  await page.close();
}

/** The store's guidance for the small tile is little or no text, so it carries only the name. */
async function promoTile(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 440px; height: 280px; overflow: hidden; box-sizing: border-box;
      font-family: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #0b5c6b 0%, #0f7385 100%); color: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
    img { width: 112px; height: 112px; border-radius: 24px; box-shadow: 0 0 0 3px #ffffff33; }
    h1 { font-size: 32px; margin: 0; font-weight: 700; letter-spacing: -.01em; }
  </style></head><body>
    <img src="${ICON}" alt="">
    <h1>Journal Club Helper</h1>
  </body></html>`);
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  writeFileSync('store/promo-small-440x280.png', await page.screenshot());
  await page.close();
}

test('store listing images', async ({ context, page, extensionId }) => {
  // A live run uses a persistent profile, whose saved appraisals would end up
  // in the images and whose earlier answers would be toggled off again.
  test.skip(LIVE, 'Render the store images from saved pages only: unset JCH_LIVE.');

  await openPubMed(page, articleUrl(RECORD), 'article');
  await expect(page.locator('#jch-open')).toBeVisible();
  const panel = await openPanelInTab(context, extensionId);
  mkdirSync(SITE_IMAGES, { recursive: true });

  // 1. The design header with its evidence, and a PICO the reader has written.
  await panel.locator('.design__evidence-summary').click();
  for (const [key, text] of Object.entries(PICO)) await type(panel, `#jch-pico-${key}`, text);
  await blur(panel);
  await panel.evaluate(() => window.scrollTo(0, 0));
  await frame(
    context,
    'store/screenshot-1.png',
    await panel.screenshot(),
    PANEL,
    'See the study design, and why it was detected',
    'The design is read from the publication type and the abstract, with the evidence shown. Change it if you disagree.',
  );

  // 2. Numbers: the relative risk from the abstract, applied to the usual-care rate.
  await tab(panel, 'Numbers');
  const ratio = panel
    .locator('.numbers__candidate')
    .filter({ has: panel.locator('.numbers__raw', { hasText: RATIO_RAW }) });
  await ratio.locator('.numbers__use').click();
  await type(panel, '#jch-numbers-acr', BASELINE_RISK);
  await panel.locator('.numbers__submit').click();
  await expect(panel.locator('.numbers__nnt')).toHaveText(EXPECTED_NNT);
  await blur(panel);
  await panel
    .locator('.numbers__result')
    .evaluate((result) => result.scrollIntoView({ block: 'end' }));
  await frame(
    context,
    'store/screenshot-2.png',
    await shoot(panel, 'numbers'),
    PANEL,
    'Get the absolute effect, not just the relative one',
    'Apply a ratio from the abstract to a baseline risk and see the ARR and the NNT, with the 95% CI carried over.',
  );

  // 3. The appraisal checklist, answered from what the abstract says.
  await tab(panel, 'Appraisal');
  await item(panel, 'Prespecified question').locator('.validity-choice--yes').click();
  const search = item(panel, 'Search comprehensiveness');
  await search.locator('.validity-choice--unclear').click();
  await search.getByText('Add a note').click();
  await search.locator('.validity-note').fill(SEARCH_NOTE);
  await blur(panel);
  await panel
    .locator('.validity-section__title')
    .first()
    .evaluate((title) => {
      title.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -16);
    });
  await frame(
    context,
    'store/screenshot-3.png',
    await shoot(panel, 'appraisal'),
    PANEL,
    'Work through risk of bias, one question at a time',
    'Checklists written for each study design. Each question says what to look for, and whether the abstract can settle it.',
  );

  // 4. Export, with the reader's bottom line.
  await tab(panel, 'Export');
  await type(panel, '#jch-bottom-line', BOTTOM_LINE);
  await blur(panel);
  await panel.evaluate(() => window.scrollTo(0, 0));
  await frame(
    context,
    'store/screenshot-4.png',
    await shoot(panel, 'export'),
    PANEL,
    'Take a one-page summary to journal club',
    'Citation, question, design, absolute effect, validity and your own bottom line. Copy it as Markdown or text, or download it.',
  );

  // The landing site's example output is this appraisal's summary, saved
  // through the panel's own Download button so it is the file a reader gets.
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download .md' }).click(),
  ]);
  mkdirSync('site/sample', { recursive: true });
  await download.saveAs('site/sample/summary.md');
  expect(readFileSync('site/sample/summary.md', 'utf8')).toContain(BOTTOM_LINE);

  // 5. Settings, where the saved appraisal and the local counters are.
  const options = await context.newPage();
  await options.setViewportSize(OPTIONS);
  await options.route(/^chrome-extension:/, (route) => route.continue());
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('body')).toContainText(`PMID ${RECORD.pmid}`);
  await frame(
    context,
    'store/screenshot-5.png',
    await options.screenshot(),
    OPTIONS,
    'Your appraisals stay on your device',
    'No account, no server, no analytics. Export a backup, or delete your appraisals, from the settings page.',
  );

  await promoTile(context);
});
