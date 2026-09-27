// @vitest-environment happy-dom
// @vitest-environment-options { "url": "https://pubmed.ncbi.nlm.nih.gov/36577095/", "settings": { "disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true } }
/**
 * GET_ARTICLE reads the page when it is asked, not once at load (#23), so the
 * panel's "Read the page again" can see a page that has changed since.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import contentScript from '../../src/entrypoints/content';
import type { GetArticleResponse } from '../../src/lib/types';

type Listener = (message: unknown, sender: unknown, reply: (r: unknown) => void) => boolean;

afterEach(() => {
  vi.unstubAllGlobals();
});

it('answers from the page as it is at the time of the request', () => {
  const html = readFileSync(resolve(__dirname, '../fixtures/pubmed/rct-36577095.html'), 'utf8');
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    'text/html',
  ).documentElement.innerHTML;

  let listener: Listener | undefined;
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: { addListener: (fn: Listener) => (listener = fn) },
      sendMessage: vi.fn(),
    },
  });
  contentScript.main!({} as never);
  expect(listener).toBeDefined();

  const ask = (): GetArticleResponse => {
    let answer: unknown;
    listener!({ type: 'GET_ARTICLE' }, {}, (r) => (answer = r));
    return answer as GetArticleResponse;
  };

  expect(ask().article?.pmid).toBe('36577095');

  // The markup changes under the page after load.
  for (const element of document.querySelectorAll('.abstract-content')) {
    element.className = 'abstract-content-renamed';
    element.removeAttribute('id');
  }
  expect(ask().article).toBeNull();
});
