/**
 * Renders the store listing images (#27) from the built extension:
 * `pnpm store:assets`. Not part of the test run and not in CI.
 *
 * Every panel image is the real build, on the saved page of a real public
 * abstract (the RCT in tests/e2e/pmids.ts), with the reader's input typed in
 * through the panel's own controls. Nothing is mocked up.
 *
 * The side panel is browser UI and cannot be screenshotted (HANDOVER §4), so
 * the panel's page is opened in an ordinary tab instead. One thing is changed
 * to make that work: the panel asks for the active tab, which would be itself,
 * so its `chrome.tabs.query` is pointed at the PubMed tab. The content script
 * there answers exactly as it does for the real panel.
 *
 * Each image is then framed at 1280×800 with a caption. The PubMed page itself
 * is left out, so no NLM branding appears in the listing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, openPubMed, test } from '../tests/e2e/fixtures';
import { RCT, RCT_PERCENT_PAIR, articleUrl } from '../tests/e2e/pmids';

const PANEL = { width: 400, height: 720 };
const OPTIONS = { width: 720, height: 720 };
const ICON = `data:image/svg+xml;base64,${readFileSync('store/icon.svg').toString('base64')}`;

/** What the reader types. Taken from the abstract of PMID 36577095. */
const PICO = {
  P: 'Symptomatic adults with mild-to-moderate Covid-19 at high risk of progression',
  I: 'VV116, a 5-day oral course',
  C: 'Nirmatrelvir–ritonavir, a 5-day oral course',
  O: 'Time to sustained clinical recovery through day 28',
};
const CONCEALMENT_NOTE = 'Not reported in the abstract. Check the methods in the full text.';
const BOTTOM_LINE =
  'Non-inferior on time to recovery, in a population with no deaths or progression. ' +
  'Allocation concealment and the handling of the 51 randomized but untreated participants need the full text.';

/** Types into a field the way a reader does, so Preact sees the input events. */
async function type(page: Page, selector: string, text: string): Promise<void> {
  const field = page.locator(selector);
  await field.click();
  await field.fill(text);
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
  }, RCT.pmid);
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.locator('body')).toContainText(`PMID ${RCT.pmid}`);
  return panel;
}

async function tab(panel: Page, name: string): Promise<void> {
  await panel.getByRole('tab', { name, exact: true }).click();
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

async function promoTile(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 440px; height: 280px; overflow: hidden; box-sizing: border-box;
      font-family: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #0b5c6b 0%, #0f7385 100%); color: #fff;
      display: flex; flex-direction: column; justify-content: center; padding: 0 36px; }
    img { width: 64px; height: 64px; border-radius: 14px; box-shadow: 0 0 0 2px #ffffff33; margin-bottom: 18px; }
    h1 { font-size: 30px; margin: 0 0 8px; font-weight: 700; letter-spacing: -.01em; }
    p { font-size: 17px; line-height: 1.4; margin: 0; color: #d5ecef; }
  </style></head><body>
    <img src="${ICON}" alt="">
    <h1>Journal Club Helper</h1>
    <p>Critical appraisal next to the abstract: PICO, NNT and a validity checklist.</p>
  </body></html>`);
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  writeFileSync('store/promo-small-440x280.png', await page.screenshot());
  await page.close();
}

test('store listing images', async ({ context, page, extensionId }) => {
  await openPubMed(page, articleUrl(RCT), 'article');
  await expect(page.locator('#jch-open')).toBeVisible();
  const panel = await openPanelInTab(context, extensionId);

  // 1. The design header with its evidence, and a PICO the reader has written.
  await panel.locator('.design__evidence-summary').click();
  await type(panel, '#jch-pico-p', PICO.P);
  await type(panel, '#jch-pico-i', PICO.I);
  await type(panel, '#jch-pico-c', PICO.C);
  await type(panel, '#jch-pico-o', PICO.O);
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

  // 2. Numbers: the percent pair from the abstract, used.
  await tab(panel, 'Numbers');
  const pair = panel
    .locator('.numbers__candidate')
    .filter({ has: panel.locator('.numbers__raw', { hasText: RCT_PERCENT_PAIR.raw }) });
  await pair.locator('.numbers__use').click();
  await expect(panel.locator('.numbers__nnt')).toHaveText(RCT_PERCENT_PAIR.nnt);
  await panel
    .locator('.numbers__result')
    .evaluate((result) => result.scrollIntoView({ block: 'end' }));
  await frame(
    context,
    'store/screenshot-2.png',
    await panel.screenshot(),
    PANEL,
    'Get the absolute effect, not just the relative one',
    'Pick a result from the abstract and see ARR, RRR and the NNT, with a 95% CI when the numbers allow one.',
  );

  // 3. The appraisal checklist, answered honestly from the abstract alone.
  await tab(panel, 'Appraisal');
  const items = panel.locator('.validity-item');
  await items.nth(0).locator('.validity-choice--unclear').click();
  await items.nth(1).locator('.validity-choice--unclear').click();
  await items.nth(1).getByText('Add a note').click();
  await items.nth(1).locator('.validity-note').fill(CONCEALMENT_NOTE);
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
    await panel.screenshot(),
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
    await panel.screenshot(),
    PANEL,
    'Take a one-page summary to journal club',
    'Citation, question, design, absolute effect, validity and your own bottom line. Copy it as Markdown or text, or download it.',
  );

  // 5. Settings, where the saved appraisal and the local counters are.
  const options = await context.newPage();
  await options.setViewportSize(OPTIONS);
  await options.route(/^chrome-extension:/, (route) => route.continue());
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('body')).toContainText(`PMID ${RCT.pmid}`);
  await frame(
    context,
    'store/screenshot-5.png',
    await options.screenshot(),
    OPTIONS,
    'Everything stays on your device',
    'No account, no server, no analytics. Export a backup or delete everything from the settings page.',
  );

  await promoTile(context);
});
