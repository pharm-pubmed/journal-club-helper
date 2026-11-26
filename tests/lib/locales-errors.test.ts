// @vitest-environment happy-dom
/**
 * Errors the reader sees, in their language (#82). Each case makes the real
 * module throw, then checks two things: in English the message is exactly the
 * one thrown, so nothing changed for English readers, and in Japanese it is
 * translated rather than passed through.
 */
import { describe, expect, it } from 'vitest';
import { EUTILS_CONTACT, fetchArticleFromEutils } from '../../src/lib/eutils';
import { createMemoryStore, setStore } from '../../src/lib/kv-store';
import { importAll, saveAppraisal } from '../../src/lib/storage';
import type { Appraisal } from '../../src/lib/types';
import { en } from '../../src/locales/en';
import { describeError } from '../../src/locales/errors';
import { ja } from '../../src/locales/ja';

async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

function ncbi(pmid: string, answer: () => Promise<Response>) {
  return thrown(
    fetchArticleFromEutils(pmid, EUTILS_CONTACT, {
      fetch: answer,
      rateLimit: async () => undefined,
    }),
  );
}

const xmlResponse = (body: string) => async () => new Response(body, { status: 200 });

function checkBothLanguages(error: unknown): void {
  expect(error).toBeInstanceOf(Error);
  const message = (error as Error).message;
  expect(describeError(error, en, 'fallback')).toBe(message);
  const japanese = describeError(error, ja, 'fallback');
  expect(japanese, message).not.toBe(message);
  expect(japanese).toMatch(/[ぁ-んァ-ン一-龥]/);
}

describe('NCBI errors', () => {
  const timeout = Object.assign(new Error('late'), { name: 'TimeoutError' });
  it.each([
    ['not a PMID', () => thrown(fetchArticleFromEutils('abc'))],
    ['timeout', () => ncbi('1', () => Promise.reject(timeout))],
    ['network', () => ncbi('1', () => Promise.reject(new Error('offline')))],
    [
      'cut off',
      () =>
        ncbi('1', async () => {
          const response = new Response('x', { status: 200 });
          Object.defineProperty(response, 'text', {
            value: () => Promise.reject(new Error('reset')),
          });
          return response;
        }),
    ],
    ['rate limit', () => ncbi('1', async () => new Response('', { status: 429 }))],
    ['http', () => ncbi('1', async () => new Response('', { status: 503 }))],
    ['not XML', () => ncbi('1', xmlResponse('<<<'))],
    [
      'book',
      () =>
        ncbi(
          '20301295',
          xmlResponse(
            '<PubmedArticleSet><PubmedBookArticle><BookDocument><PMID Version="1">20301295</PMID></BookDocument></PubmedBookArticle></PubmedArticleSet>',
          ),
        ),
    ],
    ['not found', () => ncbi('1', xmlResponse('<PubmedArticleSet></PubmedArticleSet>'))],
    [
      'no abstract',
      () =>
        ncbi(
          '1',
          xmlResponse(
            '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">1</PMID><Article><ArticleTitle>T</ArticleTitle></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>',
          ),
        ),
    ],
  ])('%s', async (_name, make) => {
    checkBothLanguages(await make());
  });
});

describe('storage and import errors', () => {
  const store = () => setStore(createMemoryStore());
  const appraisal = (pmid: string, note = ''): Appraisal => ({
    schemaVersion: 2,
    pmid,
    createdAt: 1,
    updatedAt: 1,
    citation: { title: 'T', authors: [], journal: '', year: '', doi: null },
    designDetected: null,
    designOverride: null,
    subtypeOverride: null,
    pico: { p: note, i: '', c: '', o: '' },
    numbers: null,
    validity: {},
    sourceScope: 'abstract',
    info: {},
    bottomLine: '',
    discussionQuestions: [],
  });
  const file = (fields: Record<string, unknown>) =>
    JSON.stringify({ schemaVersion: 2, exportedAt: '', appraisals: [], ...fields });

  it.each([
    ['no PMID', () => saveAppraisal(appraisal('x'))],
    ['too large', () => saveAppraisal(appraisal('1', 'x'.repeat(70_000)))],
    ['not JSON', () => importAll('{', 'merge')],
    ['not an export', () => importAll('[]', 'merge')],
    ['older version', () => importAll(JSON.stringify({ schemaVersion: 1 }), 'merge')],
    ['other version', () => importAll(JSON.stringify({ schemaVersion: 99 }), 'merge')],
    ['no list', () => importAll(file({ appraisals: null }), 'merge')],
    ['nothing to import', () => importAll(file({}), 'merge')],
    ['none readable', () => importAll(file({ appraisals: [{}] }), 'merge')],
  ])('%s', async (_name, make) => {
    store();
    checkBothLanguages(await thrown(make()));
  });

  it('import stopped, with the cause in the same language', async () => {
    const failing = createMemoryStore();
    failing.set = () => Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    setStore(failing);
    const error = await thrown(importAll(file({ appraisals: [appraisal('1')] }), 'merge'));
    checkBothLanguages(error);
    expect(describeError(error, ja, '')).toContain('QUOTA_BYTES quota exceeded');
  });

  it('shows an error that says nothing more as it is, or the fallback', () => {
    expect(describeError(new Error('from the browser'), ja, 'x')).toBe('from the browser');
    expect(describeError(undefined, ja, '代わりの文')).toBe('代わりの文');
  });
});
