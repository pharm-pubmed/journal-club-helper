/**
 * Reads a provider's answer into an `AiExtraction`, or refuses it (issue #34).
 *
 * Hand-written rather than a validation library, to keep `preact` the only
 * runtime dependency. The guard is strict about types — a wrong type anywhere
 * is a parse failure, which the provider retries once (spec §4.7) — and lenient
 * about size, which it trims instead: an answer with six questions is still an
 * answer. Keys it does not know are ignored.
 *
 * `groundExtraction` then enforces the prompt's "never invent a number" in
 * code. A fabricated figure is the one error that would cost the feature its
 * credibility (guardrails rule 10), so it is not trusted to the model:
 *   - a number candidate is kept only if its `text` appears in the abstract
 *     verbatim, whitespace aside, and holds at least two figures, so a lone
 *     "2" cannot pass by matching anything;
 *   - in every other field, each figure must appear in the title or the
 *     abstract. An entry carrying one that does not, such as a difference the
 *     model computed, is dropped, and a PICO field is emptied.
 * What this cannot check is whether a real figure is attached to the right
 * group or outcome. That stays with the reader, who accepts each candidate.
 *
 * Pure module: no `chrome.*`, no DOM.
 */
import { AiParseError, type AiExtraction, type AiInput } from './types';

/** Longest string kept from any field; the prompt asks for 200 or fewer. */
export const MAX_FIELD_LENGTH = 400;
export const MAX_NUMBERS = 6;
export const MAX_LIMITATIONS = 5;
export const MAX_QUESTIONS = 5;
/** Read before grounding, so invented entries cannot crowd out real ones. */
const MAX_NUMBERS_READ = 30;

/**
 * The JSON Schema sent with the request where the provider supports structured
 * output. Kept to plain `type`/`properties`/`required`/`items`: providers
 * support different subsets of JSON Schema, and the limits are enforced by
 * `parseExtraction` either way.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    pico: {
      type: 'object',
      properties: {
        p: { type: 'string' },
        i: { type: 'string' },
        c: { type: 'string' },
        o: { type: 'string' },
      },
      required: ['p', 'i', 'c', 'o'],
      additionalProperties: false,
    },
    numbers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['label', 'text'],
        additionalProperties: false,
      },
    },
    limitations: { type: 'array', items: { type: 'string' } },
    discussionQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['pico', 'numbers', 'limitations', 'discussionQuestions'],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_FIELD_LENGTH) return trimmed;
  let cut = MAX_FIELD_LENGTH - 1;
  // Never leave half of a surrogate pair before the ellipsis.
  const last = trimmed.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return `${trimmed.slice(0, cut)}…`;
}

function stringAt(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new AiParseError(`${where}.${key} is not a string`);
  return clip(value);
}

function arrayAt(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new AiParseError(`${key} is not an array`);
  return value;
}

function strings(record: Record<string, unknown>, key: string, max: number): string[] {
  return arrayAt(record, key)
    .map((value, index) => {
      if (typeof value !== 'string') throw new AiParseError(`${key}[${index}] is not a string`);
      return clip(value);
    })
    .filter((text) => text.length > 0)
    .slice(0, max);
}

/**
 * The JSON object inside a reply. Tolerates a code fence or a sentence around
 * it, which a provider without structured output sometimes adds despite the
 * prompt; a brace in that sentence defeats it, and that is a parse failure.
 */
function jsonObjectIn(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) throw new AiParseError('the reply contains no JSON object');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiParseError('the reply is not valid JSON');
  }
}

function isEmpty(extraction: AiExtraction): boolean {
  const { pico, numbers, limitations, discussionQuestions } = extraction;
  return (
    [pico.p, pico.i, pico.c, pico.o].every((field) => field === '') &&
    numbers.length === 0 &&
    limitations.length === 0 &&
    discussionQuestions.length === 0
  );
}

export function parseExtraction(text: string): AiExtraction {
  const root = jsonObjectIn(text);
  if (!isRecord(root)) throw new AiParseError('the reply is not a JSON object');

  const pico = root.pico;
  if (!isRecord(pico)) throw new AiParseError('pico is not an object');

  const numbers = arrayAt(root, 'numbers')
    .map((value, index) => {
      if (!isRecord(value)) throw new AiParseError(`numbers[${index}] is not an object`);
      return {
        label: stringAt(value, 'label', `numbers[${index}]`),
        text: stringAt(value, 'text', `numbers[${index}]`),
      };
    })
    .filter((n) => n.text.length > 0)
    .slice(0, MAX_NUMBERS_READ);

  const extraction: AiExtraction = {
    pico: {
      p: stringAt(pico, 'p', 'pico'),
      i: stringAt(pico, 'i', 'pico'),
      c: stringAt(pico, 'c', 'pico'),
      o: stringAt(pico, 'o', 'pico'),
    },
    numbers,
    limitations: strings(root, 'limitations', MAX_LIMITATIONS),
    discussionQuestions: strings(root, 'discussionQuestions', MAX_QUESTIONS),
  };
  // Well-formed and empty is still not an answer; worth the one retry.
  if (isEmpty(extraction)) throw new AiParseError('the answer is empty');
  return extraction;
}

/**
 * Whitespace-insensitive, so a span copied across a line break or a thin space
 * still matches, and the Lancet's decimal point "0·89" matches "0.89".
 */
function normalise(text: string): string {
  return text
    .replace(/\s+/gu, ' ')
    .replace(/\u00b7/g, '.')
    .trim();
}

const FIGURE = /\d+(?:[.,]\d+)*/g;

function figuresIn(text: string): string[] {
  return normalise(text).match(FIGURE) ?? [];
}

export function groundExtraction(extraction: AiExtraction, input: AiInput): AiExtraction {
  const abstract = normalise(input.abstract);
  const known = new Set([...figuresIn(input.title), ...figuresIn(input.abstract)]);
  const grounded = (text: string) => figuresIn(text).every((figure) => known.has(figure));

  const { pico } = extraction;
  return {
    pico: {
      p: grounded(pico.p) ? pico.p : '',
      i: grounded(pico.i) ? pico.i : '',
      c: grounded(pico.c) ? pico.c : '',
      o: grounded(pico.o) ? pico.o : '',
    },
    numbers: extraction.numbers
      .filter(
        (n) =>
          figuresIn(n.text).length >= 2 &&
          abstract.includes(normalise(n.text)) &&
          grounded(n.label),
      )
      .slice(0, MAX_NUMBERS),
    limitations: extraction.limitations.filter(grounded),
    discussionQuestions: extraction.discussionQuestions.filter(grounded),
  };
}
