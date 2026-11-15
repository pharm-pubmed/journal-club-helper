/**
 * Playwright fixtures that run the built extension in Chromium.
 *
 * Two modes, because PubMed cannot be reached by an automated browser: a
 * headless Chromium gets 403 on its user agent, and a headed one gets a
 * reCAPTCHA Enterprise "Checking your browser" page, even from a residential
 * IP (measured 2026-09-25, HANDOVER §5).
 *
 * - Default (CI): every PubMed URL the tests open is answered with the saved
 *   page from tests/fixtures/pubmed/, and every other request from a page is
 *   aborted, PubMed's own scripts included. The URL is the real one, so the
 *   content script's match pattern fires and the extension runs as shipped.
 *   This checks the extension, not PubMed.
 * - JCH_LIVE=1 (local, by hand): headed, a persistent profile, the real site.
 *   The run waits while a human passes the browser check in the window. This
 *   is the check that notices PubMed changing its markup.
 *
 * One browser serves the whole run, so a live run meets the check once rather
 * than once per test. Each test gets fresh tabs and its pages are closed after.
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
import { RCT, RECORDS } from './pmids';

export { expect };

export const LIVE = process.env.JCH_LIVE === '1';

const EXTENSION_DIR = resolve('.output/chrome-mv3');
const FIXTURE_DIR = resolve('tests/fixtures/pubmed');
const LIVE_PROFILE = process.env.JCH_E2E_PROFILE ?? join(homedir(), '.cache', 'jch-e2e-profile');

/** How long a live run waits for a human to get through PubMed's check. */
const HUMAN_CHECK_TIMEOUT = 5 * 60_000;

/** How long `evaluateInPanel` waits for the panel to answer. */
const PANEL_REPLY_TIMEOUT = 10_000;

/**
 * Stands in for a search results page. It carries an Abstract heading on
 * purpose: if the content script stopped gating on the URL, the button would
 * land here and the "no button" check would catch it. The live search page has
 * no such heading, so in a live run that check is weaker.
 */
const SEARCH_PAGE = `<!doctype html><html><head><title>VV116 - Search Results - PubMed</title></head>
<body><main><div id="abstract"><h2 class="title">Abstract</h2></div></main></body></html>`;

/**
 * A PubMed page whose abstract markup has changed under us (#23): the RCT page
 * with its abstract container renamed, so the Abstract heading and the button
 * are still there but the content script can read nothing. A test serves it at
 * the RCT's own URL with `page.route`, which takes precedence over the routes
 * below.
 */
export function unreadablePage(): string {
  return readFileSync(join(FIXTURE_DIR, RCT.fixture), 'utf8')
    .replace('class="abstract-content selected"', 'class="abstract-content-renamed"')
    .replace('id="eng-abstract"', 'id="eng-abstract-renamed"');
}

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
    // Stylesheets, scripts and trackers the saved pages reference. The content
    // script reads none of them. The cost: a PubMed script that re-renders the
    // abstract after load cannot be caught here, only by a live run.
    return route.abort();
  });
}

const isExtensionWorker = (worker: Worker): boolean =>
  worker.url().startsWith('chrome-extension://');

interface TestFixtures {
  context: BrowserContext;
  page: Page;
}

interface WorkerFixtures {
  extensionContext: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  extensionContext: [
    // Playwright requires the first argument to be a destructuring pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
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
      try {
        if (!LIVE) await serveFixtures(context);
        await context.tracing.start({ screenshots: true, snapshots: true });
        await use(context);
      } finally {
        await context.close();
        if (!LIVE) rmSync(userDataDir, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],

  serviceWorker: [
    async ({ extensionContext }, use) => {
      const running = extensionContext.serviceWorkers().find(isExtensionWorker);
      await use(
        running ??
          (await extensionContext.waitForEvent('serviceworker', { predicate: isExtensionWorker })),
      );
    },
    { scope: 'worker' },
  ],

  extensionId: [
    async ({ serviceWorker }, use) => {
      await use(new URL(serviceWorker.url()).host);
    },
    { scope: 'worker' },
  ],

  context: async ({ extensionContext }, use, testInfo) => {
    // The first tab stays open for the whole run: closing a browser's last
    // window can end the browser.
    const keep = extensionContext.pages()[0] ?? (await extensionContext.newPage());
    await extensionContext.tracing.startChunk();
    try {
      await use(extensionContext);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        const path = testInfo.outputPath('trace.zip');
        await extensionContext.tracing.stopChunk({ path });
        await testInfo.attach('trace', { path, contentType: 'application/zip' });
      } else {
        await extensionContext.tracing.stopChunk();
      }
      for (const page of extensionContext.pages()) {
        if (page !== keep) await page.close();
      }
    }
  },

  page: async ({ context }, use) => {
    await use(await context.newPage());
  },
});

/**
 * Opens a PubMed page. In a live run, first waits for the page itself to
 * appear, which may need a human to pass PubMed's browser check in the window.
 * The wait is for a sign of the real page, not for the check to go away, so an
 * interstitial nobody anticipated also ends up here rather than passing.
 */
export async function openPubMed(
  page: Page,
  url: string,
  kind: 'article' | 'search',
): Promise<void> {
  await page.goto(url);
  if (!LIVE) return;
  const message = 'Pass the PubMed browser check in the open Chromium window';
  if (kind === 'article') {
    // PubMed renders the title twice, in the full view and in the short view
    // (#short-view-heading), so the locator has to pick one.
    await expect(page.locator('h1.heading-title').first(), message).toBeVisible({
      timeout: HUMAN_CHECK_TIMEOUT,
    });
  } else {
    await expect(page, message).toHaveTitle(/PubMed/, { timeout: HUMAN_CHECK_TIMEOUT });
  }
}

/**
 * Asks the content script in the tab showing `url` for its article, the same
 * message the side panel sends. Sent from the service worker, which may message
 * any tab on a host the extension holds. The URL is matched as a prefix, so a
 * query or fragment PubMed adds does not lose the tab.
 */
export async function getArticle(serviceWorker: Worker, url: string): Promise<GetArticleResponse> {
  const response = await serviceWorker.evaluate(async (tabUrl) => {
    const [tab] = await chrome.tabs.query({ url: `${tabUrl}*` });
    if (tab?.id === undefined) throw new Error(`No tab is showing ${tabUrl}`);
    return (await chrome.tabs.sendMessage(tab.id, { type: 'GET_ARTICLE' })) as unknown;
  }, url);
  if (typeof response !== 'object' || response === null || !('article' in response)) {
    throw new Error(`The content script answered GET_ARTICLE with ${JSON.stringify(response)}`);
  }
  return response as GetArticleResponse;
}

/**
 * Evaluates `expression` inside the side panel's document and returns the
 * value. The panel is browser UI, not a Playwright page, but its document is an
 * ordinary CDP target. Playwright's CDP session cannot address a child session
 * directly, so this uses the older message-passing form of the Target domain;
 * if Chromium ever drops it, this is the function to rewrite.
 *
 * Assumes one open panel, which is what the tests arrange. Rejects rather than
 * hanging if the panel closes before it answers.
 */
export async function evaluateInPanel<T>(
  page: Page,
  extensionId: string,
  expression: string,
  /** Run as if the user had acted, which a permission prompt requires. */
  { userGesture = false }: { userGesture?: boolean } = {},
): Promise<T> {
  const session = await page.context().newCDPSession(page);
  try {
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    const { targetInfos } = await session.send('Target.getTargets');
    const panel = targetInfos.find((target) => target.url === panelUrl);
    if (panel === undefined) throw new Error('The side panel is not open');

    const { sessionId } = await session.send('Target.attachToTarget', {
      targetId: panel.targetId,
      flatten: false,
    });
    interface Reply {
      id?: number;
      result?: { result: { value: T }; exceptionDetails?: unknown };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reply = new Promise<Reply>((resolveReply, rejectReply) => {
      session.on('Target.receivedMessageFromTarget', (event) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message) as Reply;
        if (message.id === 1) resolveReply(message);
      });
      // A panel that closes mid-evaluation never answers.
      timer = setTimeout(
        () => rejectReply(new Error('The side panel did not answer; it may have closed')),
        PANEL_REPLY_TIMEOUT,
      );
    });
    await session.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true, userGesture },
      }),
    });
    const { result } = await reply.finally(() => clearTimeout(timer));
    await session.send('Target.detachFromTarget', { sessionId });
    if (result === undefined || result.exceptionDetails !== undefined) {
      throw new Error(`Evaluating in the side panel failed: ${JSON.stringify(result)}`);
    }
    return result.result.value;
  } finally {
    await session.detach();
  }
}
