/**
 * Playwright fixtures that run the built extension in Chromium.
 *
 * Two modes, because PubMed cannot be reached by an automated browser: a
 * headless Chromium gets 403 on its user agent, and a headed one gets a
 * reCAPTCHA Enterprise "Checking your browser" page, even from a residential
 * IP (measured 2026-09-25, HANDOVER §4).
 *
 * - Default (CI): every PubMed URL the tests open is answered with the saved
 *   page from tests/fixtures/pubmed/, and every other request is aborted. The
 *   URL is the real one, so the content script's match pattern fires and the
 *   whole extension runs as shipped. This checks the extension, not PubMed.
 * - JCH_LIVE=1 (local, by hand): headed, a persistent profile, the real site.
 *   The run waits while a human passes the browser check in the window; the
 *   profile keeps the result for later runs. This is the check that notices
 *   PubMed changing its markup.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import type { GetArticleResponse } from '../../src/lib/types';
import { RECORDS } from './pmids';

export { expect };

export const LIVE = process.env.JCH_LIVE === '1';

const EXTENSION_DIR = resolve('.output/chrome-mv3');
const FIXTURE_DIR = resolve('tests/fixtures/pubmed');
const LIVE_PROFILE = process.env.JCH_E2E_PROFILE ?? join(homedir(), '.cache', 'jch-e2e-profile');

/** How long a live run waits for a human to get through PubMed's check. */
const HUMAN_CHECK_TIMEOUT = 5 * 60_000;

/**
 * Stands in for a search results page. It carries an Abstract heading on
 * purpose: if the content script stopped gating on the URL, the button would
 * land here and the "no button" check would catch it.
 */
const SEARCH_PAGE = `<!doctype html><html><head><title>VV116 - Search Results - PubMed</title></head>
<body><main><div id="abstract"><h2 class="title">Abstract</h2></div></main></body></html>`;

async function serveFixtures(context: BrowserContext): Promise<void> {
  const pages = new Map(
    RECORDS.map((record) => [
      `/${record.pmid}/`,
      readFileSync(join(FIXTURE_DIR, record.fixture), 'utf8'),
    ]),
  );
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'pubmed.ncbi.nlm.nih.gov') {
      const saved = pages.get(url.pathname);
      if (saved !== undefined) {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: saved });
      }
      if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: SEARCH_PAGE });
      }
    }
    // Stylesheets, scripts and trackers the saved pages reference. Nothing the
    // content script reads comes from them, and a hermetic run cannot flake.
    return route.abort();
  });
}

interface Fixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}

export const test = base.extend<Fixtures>({
  // Playwright requires the first argument to be a destructuring pattern.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, testInfo) => {
    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
      throw new Error('No build at .output/chrome-mv3. Run `pnpm build` before the e2e tests.');
    }
    const userDataDir = LIVE ? LIVE_PROFILE : mkdtempSync(join(tmpdir(), 'jch-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // The full Chromium build: extensions do not load in the headless shell.
      channel: 'chromium',
      headless: !LIVE,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    if (!LIVE) await serveFixtures(context);
    await context.tracing.start({ screenshots: true, snapshots: true });

    await use(context);

    const failed = testInfo.status !== testInfo.expectedStatus;
    await context.tracing.stop(failed ? { path: testInfo.outputPath('trace.zip') } : undefined);
    await context.close();
    if (!LIVE) rmSync(userDataDir, { recursive: true, force: true });
  },

  serviceWorker: async ({ context }, use) => {
    const [running] = context.serviceWorkers();
    await use(running ?? (await context.waitForEvent('serviceworker')));
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

/**
 * Opens a PubMed URL. In a live run, first waits for the page to stop being
 * PubMed's browser check, which a human has to pass in the open window.
 */
export async function openPubMed(page: Page, url: string): Promise<void> {
  await page.goto(url);
  if (LIVE) {
    await expect(page, 'Pass the PubMed browser check in the open Chromium window').not.toHaveTitle(
      /Checking your browser|reCAPTCHA|^403$/i,
      { timeout: HUMAN_CHECK_TIMEOUT },
    );
  }
}

/**
 * Asks the content script in the tab showing `url` for its article, the same
 * message the side panel sends. Sent from the service worker, which may message
 * any tab on a host the extension holds.
 */
export async function getArticle(serviceWorker: Worker, url: string): Promise<GetArticleResponse> {
  return serviceWorker.evaluate(async (tabUrl) => {
    const [tab] = await chrome.tabs.query({ url: tabUrl });
    if (tab?.id === undefined) throw new Error(`No tab is showing ${tabUrl}`);
    return chrome.tabs.sendMessage(tab.id, { type: 'GET_ARTICLE' });
  }, url);
}

/** URLs of every document the browser has open, extension pages included. */
export async function openDocumentUrls(page: Page): Promise<string[]> {
  const session = await page.context().newCDPSession(page);
  try {
    const { targetInfos } = await session.send('Target.getTargets');
    return targetInfos.map((target) => target.url);
  } finally {
    await session.detach();
  }
}
