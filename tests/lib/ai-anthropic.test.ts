import { describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  createAnthropicProvider,
  requestBody,
} from '../../src/lib/ai/anthropic';
import { EXTRACT_SYSTEM_PROMPT, aiInputFrom } from '../../src/lib/ai/prompt';
import { EXTRACTION_JSON_SCHEMA } from '../../src/lib/ai/schema';
import { AiError, AiParseError, type AiExtraction, type AiInput } from '../../src/lib/ai/types';
import type { PubMedArticle } from '../../src/lib/types';

const ARTICLE: PubMedArticle = {
  pmid: '2899772',
  title: 'Randomised trial of intravenous streptokinase, oral aspirin, both, or neither',
  abstract:
    'Vascular mortality was 791/8592 (9.2%) among patients allocated streptokinase vs 1029/8595 (12.0%) with placebo, among 17 187 patients with suspected acute myocardial infarction.',
  abstractSections: [],
  publicationTypes: ['Randomized Controlled Trial'],
  meshTerms: ['Myocardial Infarction'],
  authors: ['ISIS-2 Collaborative Group'],
  journal: 'Lancet',
  year: '1988',
  doi: null,
  source: 'dom',
};
const INPUT = aiInputFrom(ARTICLE);
const OPTS = { apiKey: 'sk-ant-test', model: DEFAULT_ANTHROPIC_MODEL };

const ANSWER: AiExtraction = {
  pico: { p: 'Suspected acute MI', i: 'Streptokinase', c: 'Placebo', o: 'Vascular mortality' },
  numbers: [
    {
      label: 'Vascular deaths, streptokinase first',
      text: '791/8592 (9.2%) among patients allocated streptokinase vs 1029/8595 (12.0%)',
    },
  ],
  limitations: ['Allocation concealment is not reported in the abstract; see the full text.'],
  discussionQuestions: ['Would the 17 187 patients here resemble the ones we see?'],
};

function reply(text: string, stopReason = 'end_turn', content?: unknown[]): Response {
  return new Response(
    JSON.stringify({
      type: 'message',
      stop_reason: stopReason,
      content: content ?? [{ type: 'text', text }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function errorReply(status: number, message: string, type = 'x'): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function providerWithFetch(fetch: FetchFn, timeoutMs?: number) {
  const mock = vi.fn(fetch);
  return {
    provider: createAnthropicProvider({ fetch: mock as typeof globalThis.fetch, timeoutMs }),
    fetch: mock,
  };
}

function providerWith(...responses: (Response | Error)[]) {
  return providerWithFetch(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error('fetch called more often than expected');
    if (next instanceof Error) throw next;
    return next;
  });
}

async function failure(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiError);
    return error as AiError;
  }
  throw new Error('expected the extraction to fail');
}

describe('Anthropic provider — the request', () => {
  it('posts to the Messages API with the browser-access header and the key', async () => {
    const { provider, fetch } = providerWith(reply(JSON.stringify(ANSWER)));
    await provider.extract(INPUT, OPTS);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(String(init?.body))).toEqual(requestBody(INPUT, DEFAULT_ANTHROPIC_MODEL));
  });

  it('sends the system prompt, a bounded answer size and the schema', () => {
    const body = requestBody(INPUT, 'claude-opus-5-5') as {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: string; content: string }[];
      output_config: { format: { type: string; schema: unknown } };
    };
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.system).toBe(EXTRACT_SYSTEM_PROMPT);
    expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
    expect(body.output_config.format).toEqual({
      type: 'json_schema',
      schema: EXTRACTION_JSON_SCHEMA,
    });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]!.role).toBe('user');
    expect(body.messages[0]!.content).toContain(ARTICLE.abstract);
  });

  it('never sends the user’s notes, even when handed a whole appraisal directly', async () => {
    const appraisalLike = {
      ...ARTICLE,
      bottomLine: 'PRIVATE bottom line',
      pico: { p: 'PRIVATE population note', i: '', c: '', o: '' },
      validity: {
        rct: { concealment: { verdict: 'no', note: 'PRIVATE item note', source: null } },
      },
      info: { funding: 'PRIVATE funding note' },
    };
    // Bypasses aiInputFrom on purpose: the request is built from three named fields.
    const { provider, fetch } = providerWith(reply(JSON.stringify(ANSWER)));
    await provider.extract(appraisalLike as unknown as AiInput, OPTS);

    const sent = String(fetch.mock.calls[0]![1]?.body);
    expect(sent).not.toContain('PRIVATE');
    // Nor the article fields spec §4.7 does not list.
    expect(sent).not.toContain('Myocardial Infarction');
    expect(sent).not.toContain('ISIS-2 Collaborative Group');
    expect(sent).not.toContain('2899772');
  });

  it.each([
    ['empty', ''],
    ['with a zero-width space', 'sk-ant-​test'],
    ['with a Cyrillic letter', 'sk-ant-tеst'],
    ['with a space', 'sk-ant test'],
  ])('refuses a key that is %s before sending anything', async (_name, apiKey) => {
    const { provider, fetch } = providerWith(reply(JSON.stringify(ANSWER)));
    const error = await failure(provider.extract(INPUT, { ...OPTS, apiKey }));
    expect(error.kind).toBe('auth');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a record with no real abstract before sending anything', async () => {
    const { provider, fetch } = providerWith(reply(JSON.stringify(ANSWER)));
    const error = await failure(provider.extract({ ...INPUT, abstract: '  Letter.  ' }, OPTS));
    expect(error.kind).toBe('no-abstract');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Anthropic provider — answers', () => {
  it('returns the parsed candidates', async () => {
    const { provider } = providerWith(reply(JSON.stringify(ANSWER)));
    await expect(provider.extract(INPUT, OPTS)).resolves.toEqual(ANSWER);
  });

  it('reads the text block wherever it sits among the content blocks', async () => {
    const content = [
      { type: 'thinking', thinking: '{"not": "this"}' },
      { type: 'text', text: JSON.stringify(ANSWER) },
    ];
    const { provider } = providerWith(reply('', 'end_turn', content));
    await expect(provider.extract(INPUT, OPTS)).resolves.toEqual(ANSWER);
  });

  it('grounds the answer: an invented number and a computed figure are dropped', async () => {
    const invented = {
      ...ANSWER,
      numbers: [...ANSWER.numbers, { label: 'Absolute difference', text: 'ARR 2.8% (9.2%)' }],
      discussionQuestions: [
        ...ANSWER.discussionQuestions,
        'What does a 2.8-point difference mean?',
      ],
    };
    const { provider } = providerWith(reply(JSON.stringify(invented)));
    await expect(provider.extract(INPUT, OPTS)).resolves.toEqual(ANSWER);
  });

  it('retries once when the answer does not parse, and uses the second', async () => {
    const { provider, fetch } = providerWith(reply('{"pico": '), reply(JSON.stringify(ANSWER)));
    await expect(provider.extract(INPUT, OPTS)).resolves.toEqual(ANSWER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up with AiParseError after two unparseable answers', async () => {
    const { provider, fetch } = providerWith(reply('not json'), reply('{"pico": 1}'));
    const error = await failure(provider.extract(INPUT, OPTS));
    expect(error).toBeInstanceOf(AiParseError);
    expect(error.kind).toBe('parse');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports an HTTP error on the retry as that error', async () => {
    const { provider } = providerWith(reply('not json'), errorReply(529, 'Overloaded'));
    expect((await failure(provider.extract(INPUT, OPTS))).kind).toBe('overloaded');
  });

  it.each(['max_tokens', 'model_context_window_exceeded'])(
    'reports a %s cut-off without paying for a retry',
    async (stopReason) => {
      const cut = JSON.stringify(ANSWER).slice(0, 60);
      const { provider, fetch } = providerWith(reply(cut, stopReason));
      expect((await failure(provider.extract(INPUT, OPTS))).kind).toBe('truncated');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('reports a refusal without retrying it', async () => {
    const { provider, fetch } = providerWith(reply('', 'refusal'));
    expect((await failure(provider.extract(INPUT, OPTS))).kind).toBe('refused');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal on the retry as a refusal', async () => {
    const { provider } = providerWith(reply('not json'), reply('', 'refusal'));
    expect((await failure(provider.extract(INPUT, OPTS))).kind).toBe('refused');
  });
});

describe('Anthropic provider — failures', () => {
  it.each([
    [401, 'auth', 'authentication_error'],
    [403, 'forbidden', 'permission_error'],
    [400, 'bad-request', 'invalid_request_error'],
    [404, 'bad-request', 'not_found_error'],
    [413, 'bad-request', 'request_too_large'],
    [429, 'rate-limit', 'rate_limit_error'],
    [500, 'server', 'api_error'],
    [529, 'overloaded', 'overloaded_error'],
  ] as const)(
    'maps HTTP %i to %s, carrying the API message and type, without retrying',
    async (status, kind, type) => {
      const { provider, fetch } = providerWith(errorReply(status, 'from the API', type));
      const error = await failure(provider.extract(INPUT, OPTS));
      expect(error.kind).toBe(kind);
      expect(error.status).toBe(status);
      expect(error.message).toBe('from the API');
      expect(error.apiErrorType).toBe(type);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('falls back to the status line when the error body is not JSON', async () => {
    const { provider } = providerWith(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await failure(provider.extract(INPUT, OPTS));
    expect(error.kind).toBe('server');
    expect(error.message).toBe('HTTP 502');
    expect(error.apiErrorType).toBeNull();
  });

  it('reports a network failure', async () => {
    const { provider } = providerWith(new TypeError('Failed to fetch'));
    const error = await failure(provider.extract(INPUT, OPTS));
    expect(error.kind).toBe('network');
    expect(error.message).toContain('Failed to fetch');
  });
});

describe('Anthropic provider — cancel and timeout', () => {
  it('passes a signal that follows the user’s cancel to fetch', async () => {
    const controller = new AbortController();
    const { provider, fetch } = providerWith(reply(JSON.stringify(ANSWER)));
    await provider.extract(INPUT, { ...OPTS, signal: controller.signal });
    const signal = fetch.mock.calls[0]![1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it('sends nothing when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { provider, fetch } = providerWith(reply(JSON.stringify(ANSWER)));
    const error = await failure(provider.extract(INPUT, { ...OPTS, signal: controller.signal }));
    expect(error.kind).toBe('aborted');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a cancel during the request as aborted, not as a network failure', async () => {
    const controller = new AbortController();
    const { provider, fetch } = providerWithFetch(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const error = await failure(provider.extract(INPUT, { ...OPTS, signal: controller.signal }));
    expect(error.kind).toBe('aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when cancelled after the answer arrived', async () => {
    const controller = new AbortController();
    const { provider } = providerWithFetch(async () => {
      const response = reply(JSON.stringify(ANSWER));
      const json = response.json.bind(response);
      response.json = async () => {
        const body = await json();
        controller.abort();
        return body;
      };
      return response;
    });
    const error = await failure(provider.extract(INPUT, { ...OPTS, signal: controller.signal }));
    expect(error.kind).toBe('aborted');
  });

  it('reports a cancel while reading an error body as aborted', async () => {
    const controller = new AbortController();
    const { provider } = providerWithFetch(async () => {
      const response = errorReply(429, 'slow down');
      response.json = async () => {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      };
      return response;
    });
    const error = await failure(provider.extract(INPUT, { ...OPTS, signal: controller.signal }));
    expect(error.kind).toBe('aborted');
  });

  it('does not retry after a cancel between attempts', async () => {
    const controller = new AbortController();
    const { provider, fetch } = providerWithFetch(async () => {
      controller.abort();
      return reply('not json');
    });
    const error = await failure(provider.extract(INPUT, { ...OPTS, signal: controller.signal }));
    expect(error.kind).toBe('aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after its own timeout and says so, rather than looking cancelled', async () => {
    const { provider } = providerWithFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('timed out', 'TimeoutError')),
          );
        }),
      20,
    );
    const error = await failure(provider.extract(INPUT, OPTS));
    expect(error.kind).toBe('timeout');
  });
});

describe('Anthropic provider — cost estimate', () => {
  const provider = createAnthropicProvider({
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
  });

  it('scales with the model’s listed prices', () => {
    const sonnet = provider.estimateCost(INPUT, 'claude-sonnet-5');
    const opus = provider.estimateCost(INPUT, 'claude-opus-5-5');
    expect(opus.inputTokens).toBe(sonnet.inputTokens);
    // Opus 5.5 lists exactly twice Sonnet 5's price on both sides.
    expect(opus.usd).toBeCloseTo(sonnet.usd * 2, 10);
  });

  it('comes to about a cent for a typical abstract on the default model', () => {
    const typical = { ...INPUT, abstract: 'x'.repeat(1800) };
    const estimate = provider.estimateCost(typical, DEFAULT_ANTHROPIC_MODEL);
    expect(estimate.usd).toBeGreaterThan(0.005);
    expect(estimate.usd).toBeLessThan(0.03);
  });

  it('grows with the abstract', () => {
    const short = provider.estimateCost(INPUT, DEFAULT_ANTHROPIC_MODEL);
    const long = provider.estimateCost(
      { ...INPUT, abstract: INPUT.abstract.repeat(20) },
      DEFAULT_ANTHROPIC_MODEL,
    );
    expect(long.inputTokens).toBeGreaterThan(short.inputTokens);
  });

  it('prices an unknown model as the dearest listed one, so it errs high', () => {
    const dearest = [...ANTHROPIC_MODELS].sort(
      (a, b) => b.outputUsdPerMTok - a.outputUsdPerMTok,
    )[0]!;
    expect(provider.estimateCost(INPUT, 'claude-unknown').usd).toBe(
      provider.estimateCost(INPUT, dearest.id).usd,
    );
  });

  it('lists the default model', () => {
    expect(ANTHROPIC_MODELS.map((m) => m.id)).toContain(DEFAULT_ANTHROPIC_MODEL);
  });
});
