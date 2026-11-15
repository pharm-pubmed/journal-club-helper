/**
 * Smoke tests for the built extension in a real Chromium (#24). See
 * fixtures.ts for why CI serves saved pages and the live run is by hand.
 *
 * Everything asserted comes out of the build: the article from the content
 * script's GET_ARTICLE answer, the design and the NNT from what the side panel
 * renders. Nothing is recomputed from src/ here, so a stale build cannot hide
 * behind current source.
 */
import { readFileSync } from 'node:fs';
import type { Page, Worker } from '@playwright/test';
import type { PubMedArticle } from '../../src/lib/types';
import { DESIGN_LABELS } from '../../src/ui/labels';
import {
  LIVE,
  evaluateInPanel,
  expect,
  getArticle,
  openPubMed,
  test,
  unreadablePage,
} from './fixtures';
import { RCT, RCT_PERCENT_PAIR, RECORDS, SEARCH_URL, articleUrl, type SmokeRecord } from './pmids';

const BUTTON_MISSING =
  'The Journal Club button did not appear. Either the content script did not run, or it ' +
  'found no Abstract heading to attach to (findAnchor in src/entrypoints/content.ts).';

/** The opening words of the case-control caveat (src/lib/design-caveats.ts, #58). */
const CASE_CONTROL_CAVEAT = 'A case-control study samples on the outcome';

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
    expect(record.firstAuthor, 'first author').toContain(article.authors[0]);

    await openPanel(page, extensionId, record);
    const panelText = await evaluateInPanel<string>(page, extensionId, 'document.body.innerText');
    expect(panelText).toContain(`Study design: ${DESIGN_LABELS[record.design]}`);
  });
}

test('3. the panel turns the percent pair in the abstract into an NNT, caveated on a case-control design', async ({
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

  // #58: the same pair read as a case-control study is not a risk difference.
  // A trial shows no caveat; overriding the design from the header puts it above
  // the candidates and beside the result that is already on screen, and the
  // result itself stays. No saved page is a case-control study, so the override
  // stands in for one, which is also the path a reader takes when detection
  // misses the design.
  const caveatPlaces = `(() => {
    const has = (selector) =>
      document.querySelector(selector)?.textContent.includes(${JSON.stringify(CASE_CONTROL_CAVEAT)}) ?? false;
    return {
      candidates: has('[aria-labelledby="jch-numbers-candidates"]'),
      result: has('.numbers__result'),
      nnt: document.querySelector('.numbers__nnt')?.textContent ?? null,
    };
  })()`;
  const noCaveat = { candidates: false, result: false, nnt: RCT_PERCENT_PAIR.nnt };
  expect(await evaluateInPanel(page, extensionId, caveatPlaces)).toEqual(noCaveat);

  const chooseCaseControl = `(() => {
    const select = document.getElementById('jch-design-override');
    select.value = 'case-control';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()`;
  expect(await evaluateInPanel<string>(page, extensionId, chooseCaseControl)).toBe('case-control');
  await expect
    .poll(() => evaluateInPanel(page, extensionId, caveatPlaces), {
      message: 'overriding the design to case-control did not bring up the caveat',
    })
    .toEqual({ candidates: true, result: true, nnt: RCT_PERCENT_PAIR.nnt });

  // Put the detection back: the profile outlives this test, and a live run
  // keeps it between runs.
  const resetDesign = `(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reset to detected');
    if (!button) return 'no reset button';
    button.click();
    return 'reset';
  })()`;
  expect(await evaluateInPanel<string>(page, extensionId, resetDesign)).toBe('reset');
  await expect.poll(() => evaluateInPanel(page, extensionId, caveatPlaces)).toEqual(noCaveat);
});

/** Two ways a panel closes, which fire different events in the panel (useAutosave.ts). */
const CLOSERS = [
  {
    name: 'the panel closes itself',
    close: (page: Page, extensionId: string) =>
      evaluateInPanel(page, extensionId, 'setTimeout(() => window.close(), 0), "closing"'),
  },
  {
    name: 'the browser closes the panel',
    close: (_page: Page, _extensionId: string, serviceWorker: Worker, url: string) =>
      serviceWorker.evaluate(async (tabUrl) => {
        const [tab] = await chrome.tabs.query({ url: `${tabUrl}*` });
        // sidePanel.close() is newer than the @types/chrome in use.
        const sidePanel = chrome.sidePanel as typeof chrome.sidePanel & {
          close(options: { tabId: number }): Promise<void>;
        };
        await sidePanel.close({ tabId: tab!.id! });
      }, url),
  },
];

for (const closer of CLOSERS) {
  test(`4. an edit made just before ${closer.name} is there when it reopens`, async ({
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
    const type = `(() => {
      const field = document.querySelector('.export__textarea');
      field.value = ${JSON.stringify(bottomLine)};
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`;
    expect(await evaluateInPanel<string>(page, extensionId, type)).toBe('typed');
    await closer.close(page, extensionId, serviceWorker, articleUrl(RCT));
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
}

test('5. a page that cannot be read offers NCBI, asks inside the click, and sends nothing without the grant', async ({
  page,
  extensionId,
}) => {
  test.skip(LIVE, 'needs a page whose markup is broken on purpose, which only the fixtures have');
  const url = articleUrl(RCT);
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: unreadablePage() }),
  );
  await openPubMed(page, url, 'article');
  await expect(page.locator('#jch-open'), BUTTON_MISSING).toBeVisible();
  await page.locator('#jch-open').click();
  await expect
    .poll(() =>
      evaluateInPanel<string>(page, extensionId, 'document.body.innerText').catch(
        (error: Error) => error.message,
      ),
    )
    .toContain(`Only the PMID (${RCT.pmid})`);

  // The route above does not see requests from the panel, and neither does
  // Resource Timing there, so the panel's own fetch and permission request are
  // wrapped and read back. The extension makes requests with fetch and nothing
  // else. Whether the request ran inside the click is read from the page's
  // user activation at the moment it was made.
  const spy = `(() => {
    window.__jch = { fetches: [], requests: [] };
    const fetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      window.__jch.fetches.push(String(args[0] instanceof Request ? args[0].url : args[0]));
      return fetch(...args);
    };
    const request = chrome.permissions.request.bind(chrome.permissions);
    chrome.permissions.request = (options) => {
      window.__jch.requests.push({ options, activated: navigator.userActivation.isActive });
      return request(options);
    };
    return 'spying';
  })()`;
  expect(await evaluateInPanel<string>(page, extensionId, spy)).toBe('spying');

  // A headless browser never answers the permission prompt, so this is the
  // state of a reader who has not granted it (yet).
  const click = `(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fetch from NCBI');
    if (!button) return 'no button';
    button.click();
    return 'clicked';
  })()`;
  expect(await evaluateInPanel<string>(page, extensionId, click, { userGesture: true })).toBe(
    'clicked',
  );
  await page.waitForTimeout(1500);
  const seen = JSON.parse(
    await evaluateInPanel<string>(page, extensionId, 'JSON.stringify(window.__jch)'),
  ) as { fetches: string[]; requests: { options: unknown; activated: boolean }[] };
  expect(seen.requests).toEqual([
    { options: { origins: ['https://eutils.ncbi.nlm.nih.gov/*'] }, activated: true },
  ]);
  expect(seen.fetches).toEqual([]);
  const panelText = await evaluateInPanel<string>(page, extensionId, 'document.body.innerText');
  expect(panelText).toContain(`Fetching PMID ${RCT.pmid} from NCBI`);
  expect(panelText).not.toContain('Study design:');

  // The control: the fetch spy does record a fetch, so the empty list above
  // means something. There is no such control for `activated`: activation
  // stays live for a few seconds after a click, so it shows only that the
  // request followed one. That the request is the first thing the click does
  // is pinned by tests/ui/use-article.test.ts.
  const control = `fetch('data:text/plain,x').then(() => JSON.stringify(window.__jch.fetches))`;
  expect(await evaluateInPanel<string>(page, extensionId, control)).toBe('["data:text/plain,x"]');
});

test('7. once the reader allows it, the record comes from NCBI and the panel says so', async ({
  context,
  page,
  extensionId,
}) => {
  test.skip(LIVE, 'needs a page whose markup is broken on purpose, which only the fixtures have');
  const url = articleUrl(RCT);
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: unreadablePage() }),
  );
  await openPubMed(page, url, 'article');
  await expect(page.locator('#jch-open'), BUTTON_MISSING).toBeVisible();

  // Chrome's permission prompt is browser UI that no automated run can click,
  // which is why scenario 5 stops at "nothing is sent without the grant". Here
  // the prompt is answered Allow by a stand-in, and the panel is opened as a
  // tab so that its request to NCBI can be served from the saved record. What
  // follows the answer is the built extension's own code.
  const panel = await context.newPage();
  await panel.route(/^chrome-extension:/, (route) => route.continue());
  const sent: string[] = [];
  await panel.route('https://eutils.ncbi.nlm.nih.gov/**', (route) => {
    sent.push(route.request().url());
    return route.fulfill({
      contentType: 'text/xml; charset=utf-8',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(`tests/fixtures/eutils/${RCT.pmid}.xml`, 'utf8'),
    });
  });
  await panel.addInitScript((pmid) => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (() =>
      query({
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/*`,
      })) as unknown as typeof chrome.tabs.query;
    const asked: unknown[] = [];
    (window as unknown as { __asked: unknown[] }).__asked = asked;
    chrome.permissions.request = ((options: unknown) => {
      asked.push(options);
      return Promise.resolve(true);
    }) as unknown as typeof chrome.permissions.request;
  }, RCT.pmid);
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.locator('body')).toContainText('The abstract on this page could not be read');

  await panel.getByRole('button', { name: 'Fetch from NCBI' }).click();
  await expect(panel.locator('body')).toContainText('via NCBI E-utilities');
  await expect(panel.locator('body')).toContainText(`PMID ${RCT.pmid}`);
  await expect(panel.locator('body')).toContainText(DESIGN_LABELS[RCT.design]);
  expect(await panel.evaluate(() => (window as unknown as { __asked: unknown[] }).__asked)).toEqual(
    [{ origins: ['https://eutils.ncbi.nlm.nih.gov/*'] }],
  );

  // One request, for this record, naming the tool, and carrying nothing else.
  expect(sent).toHaveLength(1);
  const request = new URL(sent[0]!);
  expect(request.pathname).toBe('/entrez/eutils/efetch.fcgi');
  expect(Object.fromEntries(request.searchParams)).toMatchObject({
    db: 'pubmed',
    id: RCT.pmid,
    tool: 'journal-club-helper',
    email: 'journal.club.helper@gmail.com',
  });
  await panel.close();
});

/**
 * Runs in the panel: switches to `tab`, then types `text` into `selector`, or
 * reads it when `text` is null. Returns why it could not, so callers can poll.
 */
function inPanelField(tab: string, selector: string, text: string | null): string {
  return `(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === ${JSON.stringify(tab)});
    if (!tab) return 'no ${tab} tab';
    tab.click();
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return 'no field ${selector}';
    const text = ${JSON.stringify(text)};
    if (text === null) return 'field: ' + field.value;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  })()`;
}

/** Everything in the extension's storage, read by the service worker. */
function storedData(serviceWorker: Worker): Promise<Record<string, unknown>> {
  return serviceWorker.evaluate(() => chrome.storage.local.get(null));
}

test('6. Delete all in Settings reaches an open panel, which does not write the deleted appraisal back', async ({
  context,
  page,
  serviceWorker,
  extensionId,
}) => {
  const key = `appraisal:${RCT.pmid}`;
  const setAside = 'appraisal-unreadable:10000001';
  await readRecord(page, serviceWorker, RCT);
  await openPanel(page, extensionId, RCT);

  const before = `Written before Delete all, ${Date.now()}`;
  await expect
    .poll(() =>
      evaluateInPanel<string>(
        page,
        extensionId,
        inPanelField('Export', '.export__textarea', before),
      ),
    )
    .toBe('typed');
  await expect
    .poll(async () => JSON.stringify((await storedData(serviceWorker))[key] ?? null), {
      message: 'the edit before Delete all was never saved, so the test would prove nothing',
    })
    .toContain(before);
  // A record this version could not read, which Delete all has to remove too.
  await serviceWorker.evaluate(
    (setAsideKey) => chrome.storage.local.set({ [setAsideKey]: { schemaVersion: 1 } }),
    setAside,
  );

  const options = await context.newPage();
  // The fixtures abort every request that is not PubMed, the extension's own
  // scripts included, so this page lets them through.
  await options.route(`chrome-extension://${extensionId}/**`, (route) => route.continue());
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('button', { name: 'Delete all appraisals' }).click();
  await expect(options.getByRole('group', { name: /Confirm/ })).toContainText(
    'and 1 record this version could not read?',
  );
  await options.getByRole('button', { name: 'Yes, delete everything' }).click();
  // Earlier scenarios may have saved other records in the same profile.
  await expect(options.getByRole('status')).toContainText(
    /Deleted \d+ appraisals? and 1 record this version could not read\./,
  );
  const afterDelete = await storedData(serviceWorker);
  expect(afterDelete[key]).toBeUndefined();
  expect(afterDelete[setAside]).toBeUndefined();
  expect(afterDelete['settings'], 'the usage counts are kept').toBeDefined();

  // Back to the article. The wait covers the message reaching the panel and its
  // re-read of storage, neither of which anything in the panel's text marks.
  await page.bringToFront();
  await page.waitForTimeout(1000);
  const after = `Typed after Delete all, ${Date.now()}`;
  await expect
    .poll(() =>
      evaluateInPanel<string>(page, extensionId, inPanelField('PICO', '#jch-pico-i', after)),
    )
    .toBe('typed');
  await expect
    .poll(async () => JSON.stringify((await storedData(serviceWorker))[key] ?? null), {
      message: 'the edit after Delete all was never saved',
    })
    .toContain(after);
  expect(
    JSON.stringify((await storedData(serviceWorker))[key]),
    'the panel wrote the deleted appraisal back',
  ).not.toContain(before);
  // The tab renders on the next frame, so this polls until the field is there.
  await expect
    .poll(
      () =>
        evaluateInPanel<string>(
          page,
          extensionId,
          inPanelField('Export', '.export__textarea', null),
        ),
      { message: 'the panel did not show a fresh form for the article' },
    )
    .toBe('field: ');
});
