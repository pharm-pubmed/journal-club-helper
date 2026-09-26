/**
 * Anthropic provider for AI extraction (issue #34, spec §4.7).
 *
 * Called straight from the extension with the user's own key: there is no
 * server of ours in the path, which is what lets the privacy policy say that
 * nothing reaches us. `anthropic-dangerous-direct-browser-access` is the
 * header Anthropic requires to accept a request carrying a key from a browser;
 * the "dangerous" is about shipping *your* key to strangers' browsers, which a
 * bring-your-own-key extension does not do.
 *
 * Besides the fixed system prompt, the model id and the output schema, the
 * request carries what `renderUserMessage` reads from the input by name: the
 * title, the abstract and the publication types, and nothing else.
 *
 * Pure module apart from `fetch`, which is injectable for the tests.
 */
import { EXTRACT_SYSTEM_PROMPT, renderUserMessage } from './prompt';
import { EXTRACTION_JSON_SCHEMA, groundExtraction, parseExtraction } from './schema';
import {
  AiError,
  AiParseError,
  type AiCostEstimate,
  type AiErrorKind,
  type AiExtraction,
  type AiInput,
  type AiProvider,
} from './types';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicModel {
  id: string;
  label: string;
  /**
   * US dollars per million tokens, from platform.claude.com/docs/en/about-claude/pricing
   * on 2026-09-26. Only used for the estimate shown before a run.
   */
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

/**
 * Checked against platform.claude.com/docs/en/about-claude/models/overview on
 * 2026-09-26. Haiku 4.5 is left out although it is cheaper: its retirement is
 * "not sooner than October 15, 2026", three weeks away, and a stored setting
 * pointing at a retired model fails every run with a 404.
 */
export const ANTHROPIC_MODELS: readonly AnthropicModel[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
];

/**
 * The prompt's rules turn on distinctions (a label versus a method,
 * non-inferiority versus equivalence) that are the whole point of the feature,
 * and Sonnet handles them at about a cent a run.
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

/** Room for the longest answer the prompt allows, with margin. */
const MAX_TOKENS = 2048;
/** A typical answer; the estimate is shown as approximate. */
const ESTIMATED_OUTPUT_TOKENS = 700;
/** Tokens the API adds for structured output, which the estimate cannot see. A guess. */
const SCHEMA_OVERHEAD_TOKENS = 300;
/**
 * Anthropic's rule of thumb is 4 characters a token for English, and its
 * pricing page says the tokenizer in newer models produces about 30% more
 * tokens for the same text. 3 keeps the estimate on the high side. PubMed
 * abstracts are English; other scripts would be undercounted.
 */
const CHARS_PER_TOKEN = 3;
/** Spec §4.7: one retry when the answer does not parse, then back to manual entry. */
const ATTEMPTS = 2;
/** A run normally takes seconds. Past this, the user is told, not left waiting. */
export const DEFAULT_TIMEOUT_MS = 90_000;
/**
 * Below this there is nothing to extract from, and a model given little more
 * than a well-known title would answer from memory, which the prompt forbids.
 */
export const MIN_ABSTRACT_LENGTH = 100;
/** Printable ASCII only: what an API key is made of, and what a header can carry. */
const API_KEY_SHAPE = /^[\x21-\x7e]+$/;

type Fetch = typeof fetch;
type RequestOpts = { apiKey: string; model: string; signal?: AbortSignal };

function statusKind(status: number): AiErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate-limit';
  if (status === 529) return 'overloaded';
  if (status >= 500) return 'server';
  return 'bad-request';
}

/** Anthropic's error body is `{ type: 'error', error: { type, message } }`. */
async function apiError(response: Response): Promise<{ message: string; type: string | null }> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown; type?: unknown } };
    return {
      message:
        typeof body.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`,
      type: typeof body.error?.type === 'string' ? body.error.type : null,
    };
  } catch {
    return { message: `HTTP ${response.status}`, type: null };
  }
}

export function requestBody(input: AiInput, model: string): Record<string, unknown> {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderUserMessage(input) }],
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_JSON_SCHEMA } },
  };
}

function modelPrice(model: string): AnthropicModel {
  // An unknown id is priced as the dearest listed model, so the estimate errs high.
  return (
    ANTHROPIC_MODELS.find((m) => m.id === model) ??
    [...ANTHROPIC_MODELS].sort((a, b) => b.outputUsdPerMTok - a.outputUsdPerMTok)[0]!
  );
}

export function createAnthropicProvider(
  deps: { fetch?: Fetch; timeoutMs?: number } = {},
): AiProvider {
  const fetchImpl: Fetch = deps.fetch ?? ((...args) => fetch(...args));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * The user's cancel and our timeout are one signal for `fetch`, and told apart
   * afterwards: a cancel shows nothing, a timeout has to say so.
   */
  function stopIfStopped(user: AbortSignal | undefined, timeout: AbortSignal): void {
    if (user?.aborted) throw new AiError('aborted', 'The request was cancelled.');
    if (timeout.aborted) {
      throw new AiError('timeout', `Anthropic did not answer within ${timeoutMs / 1000} seconds.`);
    }
  }

  async function requestOnce(input: AiInput, opts: RequestOpts): Promise<string> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const stop = () => stopIfStopped(opts.signal, timeout);

    let response: Response;
    try {
      response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(requestBody(input, opts.model)),
        signal,
      });
    } catch (error) {
      stop();
      const detail = error instanceof Error ? error.message : String(error);
      throw new AiError('network', `Could not reach Anthropic: ${detail}`);
    }

    if (!response.ok) {
      const { message, type } = await apiError(response);
      stop();
      throw new AiError(statusKind(response.status), message, response.status, type);
    }

    let body: { stop_reason?: unknown; content?: unknown };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      stop();
      throw new AiParseError('the response body is not JSON');
    }
    stop();
    if (body.stop_reason === 'refusal') {
      throw new AiError('refused', 'The model declined to answer for this abstract.');
    }
    // Retrying a cut-off answer with the same budget would only pay for it twice.
    if (body.stop_reason === 'max_tokens' || body.stop_reason === 'model_context_window_exceeded') {
      throw new AiError('truncated', 'The answer was cut off before it was complete.');
    }
    const blocks = Array.isArray(body.content) ? body.content : [];
    return blocks
      .filter(
        (b): b is { type: 'text'; text: string } =>
          b?.type === 'text' && typeof b.text === 'string',
      )
      .map((b) => b.text)
      .join('');
  }

  async function extract(input: AiInput, opts: RequestOpts): Promise<AiExtraction> {
    // Checked before anything is sent: a key with a stray character would
    // otherwise surface as a network failure, and an empty one costs a round trip.
    if (!API_KEY_SHAPE.test(opts.apiKey)) {
      throw new AiError(
        'auth',
        'The API key is empty or contains a character an API key cannot have. Paste it again.',
      );
    }
    if (input.abstract.trim().length < MIN_ABSTRACT_LENGTH) {
      throw new AiError('no-abstract', 'This record has no abstract to extract from.');
    }

    let lastParseError: AiParseError | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (opts.signal?.aborted) throw new AiError('aborted', 'The request was cancelled.');
      const text = await requestOnce(input, opts);
      try {
        return groundExtraction(parseExtraction(text), input);
      } catch (error) {
        if (!(error instanceof AiParseError)) throw error;
        lastParseError = error;
      }
    }
    throw new AiParseError(
      `No usable answer after ${ATTEMPTS} attempts: ${lastParseError?.message}`,
    );
  }

  /** One attempt at a typical answer length; a retry, when one happens, doubles it. */
  function estimateCost(input: AiInput, model: string): AiCostEstimate {
    const chars = EXTRACT_SYSTEM_PROMPT.length + renderUserMessage(input).length;
    const inputTokens = Math.ceil(chars / CHARS_PER_TOKEN) + SCHEMA_OVERHEAD_TOKENS;
    const outputTokens = ESTIMATED_OUTPUT_TOKENS;
    const price = modelPrice(model);
    const usd =
      (inputTokens * price.inputUsdPerMTok + outputTokens * price.outputUsdPerMTok) / 1_000_000;
    return { inputTokens, outputTokens, usd };
  }

  return { id: 'anthropic', extract, estimateCost };
}
