/**
 * The AI extraction contract (issue #34, spec §4.7).
 *
 * A provider turns a title, an abstract and the publication types into
 * *candidates*. Nothing here writes to an appraisal: the panel shows each
 * candidate and the user accepts or discards it (#35).
 *
 * Pure module: no `chrome.*`, no DOM.
 */

export interface AiExtraction {
  pico: { p: string; i: string; c: string; o: string };
  /**
   * `text` is a verbatim span of the abstract. The panel offers it to the
   * calculator when `extractNumberCandidates` can read it, and shows it for
   * manual entry when it cannot (the arms are often separated by more prose
   * than it accepts, #49).
   */
  numbers: { label: string; text: string }[];
  limitations: string[];
  /** 3–5, for discussion, never answers. */
  discussionQuestions: string[];
}

/**
 * Everything a provider is allowed to send. Spec §4.7: the title, the abstract
 * and the publication types, and never the user's own notes. Build it with
 * `aiInputFrom` rather than by hand, so no other field can ride along.
 */
export interface AiInput {
  title: string;
  abstract: string;
  publicationTypes: string[];
}

export type AiProviderId = 'anthropic' | 'openai';

export interface AiCostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface AiProvider {
  id: AiProviderId;
  extract(
    input: AiInput,
    opts: { apiKey: string; model: string; signal?: AbortSignal },
  ): Promise<AiExtraction>;
  estimateCost(input: AiInput, model: string): AiCostEstimate;
}

/**
 * Why a run failed, in the terms the panel needs to tell the user what to do:
 * `auth` means check the key, `parse` and `truncated` mean enter it manually
 * (spec §4.7), `aborted` means the user cancelled and nothing should be shown,
 * and `timeout` is not a cancel. `forbidden` is the provider's HTTP 403, not a
 * browser permission the user declined.
 */
export type AiErrorKind =
  | 'auth'
  | 'forbidden'
  | 'rate-limit'
  | 'overloaded'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'aborted'
  | 'timeout'
  | 'refused'
  | 'truncated'
  | 'no-abstract'
  | 'parse';

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** HTTP status when the provider answered with one. */
  readonly status: number | null;
  /** The provider's own error type, e.g. Anthropic's `invalid_request_error`. */
  readonly apiErrorType: string | null;

  constructor(
    kind: AiErrorKind,
    message: string,
    status: number | null = null,
    apiErrorType: string | null = null,
  ) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.status = status;
    this.apiErrorType = apiErrorType;
  }
}

/** The provider answered, twice, with something that is not an `AiExtraction`. */
export class AiParseError extends AiError {
  constructor(message: string) {
    super('parse', message);
    this.name = 'AiParseError';
  }
}
