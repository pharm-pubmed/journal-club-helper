/**
 * Number candidate detection for PubMed abstracts (issue #10, spec §4.3).
 *
 * The module only *proposes* candidates. The Numbers tab lists them and the user
 * picks one (spec §9: nothing is ever auto-confirmed), so a miss costs one manual
 * entry while a wrong candidate costs trust. Every pattern below is therefore
 * deliberately narrow: known phrasings only, no clever inference.
 *
 * `first` / `second` (and `a…` / `b…`) keep document order. Which arm is the
 * control group is a question for the user, not for a regex.
 *
 * Pure module: no `chrome.*`, no DOM.
 */

import type {
  FractionPairCandidate,
  NumberCandidate,
  PercentPairCandidate,
  RatioCandidate,
  RatioMeasure,
} from './types';

export type { NumberCandidate, Span } from './types';

/* ------------------------------------------------------------- sentences */

/**
 * Words whose trailing period never ends a sentence. "vs." is the one that
 * matters — it appears in almost every results section — but the medical
 * abbreviations around it are cheap to add and equally harmless.
 */
const ABBREVIATIONS = new Set([
  'vs',
  'approx',
  'ca',
  'cf',
  'dr',
  'eg',
  'est',
  'etc',
  'fig',
  'figs',
  'ie',
  'inc',
  'jr',
  'ltd',
  'max',
  'min',
  'mr',
  'mrs',
  'ms',
  'no',
  'nos',
  'prof',
  'ref',
  'refs',
  'sr',
  'st',
  'vol',
]);

const SENTENCE_END_RE = /[.!?]+(?=\s|$)/g;
const LETTER_RE = /[A-Za-z]/;

interface SentenceSpan {
  start: number;
  end: number;
  /** Trimmed sentence text, which is what candidates carry. */
  text: string;
}

/** True when the period at `dotIndex` closes an abbreviation instead of a sentence. */
function isAbbreviationDot(text: string, dotIndex: number): boolean {
  if (text[dotIndex] !== '.') return false;

  let wordStart = dotIndex;
  while (wordStart > 0 && LETTER_RE.test(text[wordStart - 1] ?? '')) {
    wordStart -= 1;
  }
  const word = text.slice(wordStart, dotIndex);
  if (word.length === 0) return false;
  // Single letters are initials or the tail of "e.g." / "i.e.".
  if (word.length === 1) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let cursor = 0;

  SENTENCE_END_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END_RE.exec(text)) !== null) {
    if (isAbbreviationDot(text, match.index)) continue;
    const end = match.index + match[0].length;
    spans.push({ start: cursor, end, text: text.slice(cursor, end).trim() });
    cursor = end;
  }
  if (cursor < text.length) {
    spans.push({ start: cursor, end: text.length, text: text.slice(cursor).trim() });
  }
  return spans;
}

/** Index of the sentence containing `offset`, or -1. Spans are contiguous and sorted. */
function sentenceIndexAt(spans: SentenceSpan[], offset: number): number {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const span = spans[mid];
    if (span === undefined) break;
    if (offset < span.start) high = mid - 1;
    else if (offset >= span.end) low = mid + 1;
    else return mid;
  }
  return -1;
}

/* ---------------------------------------------------------- percent pairs */

/**
 * The leading lookbehind keeps a match from starting inside a number, which
 * matters twice over: "120% vs 45%" must never be read as "20% vs 45%" (the
 * rescan below starts one character into the previous match), and on a long run
 * of digits it stops the engine from retrying `\d+` at every offset.
 *
 * The bare "v" is BMJ house style ("24.2% v 29.8%", #49). The whitespace required
 * on both sides keeps it a word of its own, so "vitamin", "IV" and "v." never
 * qualify.
 */
const PERCENT_PAIR_RE =
  /(?<![\d.])(\d+(?:\.\d+)?)\s?%\s+(vs\.?|versus|and|compared\s+with|v)\s+(\d+(?:\.\d+)?)\s?%/gi;

/**
 * A bare "X% and Y%" is far more often two unrelated figures than a comparison
 * (issue #1 B9), so it is only accepted inside a sentence that talks about an
 * outcome.
 */
const OUTCOME_CUE_RE = /\b(?:rates?|incidence|occurred|mortality|response|events?)\b/i;

/**
 * The pair patterns are case-insensitive, which lets a capital "V" through. On
 * its own between two numbers that is a Roman numeral (a stage, a class), not
 * BMJ's connector, so it is turned away.
 */
function isRomanFive(connector: string): boolean {
  return connector === 'V';
}

/** "vs", "vs." and BMJ's "v" all read as "vs". */
function normalizeConnector(raw: string): PercentPairCandidate['connector'] {
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
  if (normalized === 'versus') return 'versus';
  if (normalized === 'compared with') return 'compared with';
  if (normalized === 'and') return 'and';
  return 'vs';
}

function collectPercentPairs(text: string, spans: SentenceSpan[], out: NumberCandidate[]): void {
  PERCENT_PAIR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PERCENT_PAIR_RE.exec(text)) !== null) {
    // Restart one character in so overlapping readings ("20% and 12% vs 8%")
    // are both proposed; dedupeCandidates() then keeps the stronger one.
    PERCENT_PAIR_RE.lastIndex = match.index + 1;

    const raw = match[0];
    const firstText = match[1];
    const connectorText = match[2];
    const secondText = match[3];
    if (firstText === undefined || connectorText === undefined || secondText === undefined) {
      continue;
    }
    if (isRomanFive(connectorText)) continue;

    const first = Number.parseFloat(firstText);
    const second = Number.parseFloat(secondText);
    // Above 100% these are relative changes, not event rates the calculator can use.
    if (!Number.isFinite(first) || !Number.isFinite(second) || first > 100 || second > 100) {
      continue;
    }

    const start = match.index;
    const end = start + raw.length;
    const sentenceIndex = sentenceIndexAt(spans, start);
    if (sentenceIndex === -1 || sentenceIndex !== sentenceIndexAt(spans, end - 1)) continue;
    const sentence = spans[sentenceIndex]?.text ?? '';

    const connector = normalizeConnector(connectorText);
    if (connector === 'and' && !OUTCOME_CUE_RE.test(sentence)) continue;

    out.push({ kind: 'percent-pair', raw, start, end, sentence, first, second, connector });
  }
}

/* --------------------------------------------------------- fraction pairs */

/**
 * A count inside a fraction. BMJ groups thousands with a thin space ("18 061",
 * #49), which the page extractor turns into a plain space; U+2009 and U+202F are
 * accepted too in case that normalisation ever changes. One separator between a
 * 1–3 digit group and whole 3-digit groups, nothing looser, and only here: a
 * space between two numbers anywhere else is just a space.
 */
const COUNT = String.raw`\d{1,3}(?:[ \u2009\u202F]\d{3})+(?!\d)|\d+`;
const GROUP_SEPARATOR_RE = /[ \u2009\u202F]/g;

/**
 * Keeps a count from starting on a later group of a grouped number ("061" in
 * "18 061"). Besides the misreading, starting there would let the engine retry
 * every group of a long run, which is quadratic.
 */
const NOT_MID_GROUP = String.raw`(?!(?<=\d[ \u2009\u202F])\d{3}(?!\d))`;

function parseCount(text: string): number {
  return Number.parseInt(text.replace(GROUP_SEPARATOR_RE, ''), 10);
}

/**
 * "45/300 vs 62/298", optionally with the inline percentage that abstracts like
 * to add: "45/300 (15.0%) vs 62/298". The parenthetical is length-capped, and
 * the lookbehind keeps a match from starting inside a number, so the pattern
 * stays linear. The connectors are the percent pair's, "compared with" aside.
 */
const FRACTION_SLASH_RE = new RegExp(
  String.raw`(?<![\d.])${NOT_MID_GROUP}(${COUNT})\s*\/\s*(${COUNT})(?:\s*\([^)]{0,24}\))?\s+(vs\.?|versus|and|v)\s+(${COUNT})\s*\/\s*(${COUNT})`,
  'gi',
);

/** "12 of 300". Two of these in one sentence make a pair (see collectFractionOfPairs). */
const FRACTION_OF_RE = new RegExp(
  String.raw`\b${NOT_MID_GROUP}(${COUNT})\s+of\s+(${COUNT})\b`,
  'gi',
);

/** Widest gap allowed between "12 of 300" and "20 of 298" before they stop being a pair. */
const MAX_OF_GAP = 80;

/**
 * One arm written as "n/N (x%)". Two of them with prose in between make a pair
 * (see collectFractionProsePairs).
 */
const FRACTION_ARM_RE = new RegExp(
  String.raw`(?<![\d./])${NOT_MID_GROUP}(${COUNT})\s*\/\s*(${COUNT})\s*\(\s*(\d+(?:\.\d+)?)\s?%\s*\)`,
  'g',
);

/** Widest stretch of prose allowed between two "n/N (x%)" arms. */
const MAX_PROSE_GAP = 80;

/**
 * The prose has to say "versus" outright. "and" is not enough here: between two
 * arms with words around them it joins subgroups and outcomes far more often
 * than it compares two groups.
 */
const PROSE_CONNECTOR_RE = /(?:^|\s)(?:vs\.?|versus|v|compared\s+with)(?=\s)/;

/**
 * A digit in the prose is another figure (a time point, a dose, a second
 * outcome), and a semicolon or colon starts another clause. Either way the two
 * arms stop being one comparison.
 */
const PROSE_BREAK_RE = /[\d;:]/;

/** Nothing but the connector: FRACTION_SLASH_RE already reads that pair. */
const BARE_CONNECTOR_RE = /^\s+(?:vs\.?|versus|and|v)\s+$/i;

/**
 * Dates are the main source of bogus "fractions": "3/2019 and 5/2021" is an
 * enrolment window, not two proportions.
 */
function looksLikeDate(events: number, total: number, connector: string): boolean {
  // A year-shaped denominator means the slash is a month/year date.
  if (total >= 1900 && total <= 2100) return true;
  // "3/15 and 4/20" — month/day, and only "and" ever joins two dates.
  if (connector === 'and' && events <= 12 && total <= 31) return true;
  return false;
}

function isUsableFraction(events: number, total: number): boolean {
  return Number.isFinite(events) && Number.isFinite(total) && total > 0 && events <= total;
}

function collectFractionSlashPairs(
  text: string,
  spans: SentenceSpan[],
  out: NumberCandidate[],
): void {
  FRACTION_SLASH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FRACTION_SLASH_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;

    const aEventsText = match[1];
    const aTotalText = match[2];
    const connectorText = match[3];
    const bEventsText = match[4];
    const bTotalText = match[5];
    if (
      aEventsText === undefined ||
      aTotalText === undefined ||
      connectorText === undefined ||
      bEventsText === undefined ||
      bTotalText === undefined
    ) {
      continue;
    }

    // A neighbouring slash means we cut into a longer date such as 3/15/2019.
    if (text[start - 1] === '/' || text[end] === '/') continue;
    if (isRomanFive(connectorText)) continue;

    const aEvents = parseCount(aEventsText);
    const aTotal = parseCount(aTotalText);
    const bEvents = parseCount(bEventsText);
    const bTotal = parseCount(bTotalText);
    if (!isUsableFraction(aEvents, aTotal) || !isUsableFraction(bEvents, bTotal)) continue;

    const connector = connectorText.toLowerCase().replace(/\.$/, '');
    if (looksLikeDate(aEvents, aTotal, connector) || looksLikeDate(bEvents, bTotal, connector)) {
      continue;
    }

    const sentenceIndex = sentenceIndexAt(spans, start);
    if (sentenceIndex === -1 || sentenceIndex !== sentenceIndexAt(spans, end - 1)) continue;

    out.push({
      kind: 'fraction-pair',
      raw,
      start,
      end,
      sentence: spans[sentenceIndex]?.text ?? '',
      aEvents,
      aTotal,
      bEvents,
      bTotal,
    });
  }
}

/**
 * Pairs consecutive "n of N" counts. The issue words this as one regex with a
 * bounded `[^.]` gap; matching the two halves separately and then requiring the
 * same sentence covers the same ground without tripping over the periods that
 * real abstracts put in between ("12 of 300 (4.0%) vs. 20 of 298").
 */
function collectFractionOfPairs(text: string, spans: SentenceSpan[], out: NumberCandidate[]): void {
  const matches: RegExpExecArray[] = [];
  FRACTION_OF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FRACTION_OF_RE.exec(text)) !== null) {
    matches.push(match);
  }

  for (let i = 0; i + 1 < matches.length; i += 1) {
    const left = matches[i];
    const right = matches[i + 1];
    if (left === undefined || right === undefined) continue;

    const leftEnd = left.index + left[0].length;
    if (right.index - leftEnd > MAX_OF_GAP) continue;

    const aEvents = parseCount(left[1] ?? '');
    const aTotal = parseCount(left[2] ?? '');
    const bEvents = parseCount(right[1] ?? '');
    const bTotal = parseCount(right[2] ?? '');
    if (!isUsableFraction(aEvents, aTotal) || !isUsableFraction(bEvents, bTotal)) continue;

    const start = left.index;
    const end = right.index + right[0].length;
    const sentenceIndex = sentenceIndexAt(spans, start);
    if (sentenceIndex === -1 || sentenceIndex !== sentenceIndexAt(spans, end - 1)) continue;

    out.push({
      kind: 'fraction-pair',
      raw: text.slice(start, end),
      start,
      end,
      sentence: spans[sentenceIndex]?.text ?? '',
      aEvents,
      aTotal,
      bEvents,
      bTotal,
    });
  }
}

/**
 * True when the percentage an arm prints is what its own counts give, to within
 * one unit of the last digit printed (a little looser than rounding, for the
 * abstracts that truncate).
 */
function matchesOwnPercent(events: number, total: number, percentText: string): boolean {
  const percent = Number.parseFloat(percentText);
  if (!Number.isFinite(percent)) return false;
  const decimals = percentText.split('.')[1]?.length ?? 0;
  return Math.abs((events / total) * 100 - percent) <= 10 ** -decimals + 1e-9;
}

/**
 * Pairs two "n/N (x%)" arms that have prose between them, the way ISIS-2
 * (PMID 2899772) reports its primary result: "791/8592 (9.2%) among patients
 * allocated streptokinase infusion vs 1029/8595 (12.0%) among those allocated
 * placebo infusion".
 *
 * Letting words in between is how dates and doses turn into bogus fractions, so
 * every condition here has to hold: consecutive arms in one sentence, at most
 * 80 characters apart, prose with no digit, semicolon or colon in it that says
 * "vs", "versus", "v" or "compared with", and each arm's percentage matching its
 * own counts. The last is what keeps a date or a dose out: nothing but a real
 * proportion is followed by its own value as a percentage.
 */
function collectFractionProsePairs(
  text: string,
  spans: SentenceSpan[],
  out: NumberCandidate[],
): void {
  const arms: RegExpExecArray[] = [];
  FRACTION_ARM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FRACTION_ARM_RE.exec(text)) !== null) {
    arms.push(match);
  }

  for (let i = 0; i + 1 < arms.length; i += 1) {
    const left = arms[i];
    const right = arms[i + 1];
    if (left === undefined || right === undefined) continue;

    const leftEnd = left.index + left[0].length;
    const gap = text.slice(leftEnd, right.index);
    if (gap.length > MAX_PROSE_GAP || PROSE_BREAK_RE.test(gap)) continue;
    if (BARE_CONNECTOR_RE.test(gap) || !PROSE_CONNECTOR_RE.test(gap)) continue;

    const aEvents = parseCount(left[1] ?? '');
    const aTotal = parseCount(left[2] ?? '');
    const bEvents = parseCount(right[1] ?? '');
    const bTotal = parseCount(right[2] ?? '');
    if (!isUsableFraction(aEvents, aTotal) || !isUsableFraction(bEvents, bTotal)) continue;
    if (
      !matchesOwnPercent(aEvents, aTotal, left[3] ?? '') ||
      !matchesOwnPercent(bEvents, bTotal, right[3] ?? '')
    ) {
      continue;
    }

    const start = left.index;
    const end = right.index + right[0].length;
    const sentenceIndex = sentenceIndexAt(spans, start);
    if (sentenceIndex === -1 || sentenceIndex !== sentenceIndexAt(spans, end - 1)) continue;

    out.push({
      kind: 'fraction-pair',
      raw: text.slice(start, end),
      start,
      end,
      sentence: spans[sentenceIndex]?.text ?? '',
      aEvents,
      aTotal,
      bEvents,
      bTotal,
    });
  }
}

/* ------------------------------------------------------------------ ratios */

/**
 * `RR|HR|OR` (with the adjusted prefix: aHR, aOR) or the spelled-out names,
 * an estimate, an optional 95% CI (en dash, em dash, hyphen or "to") and an
 * optional trailing P value.
 *
 * Case matters: a case-insensitive `OR` would match the English word "or" in
 * every second sentence, so the abbreviations stay upper case and only the
 * spelled-out names allow a capitalised first letter.
 *
 * The estimate has to follow the measure directly ("HR 0.72", "HR=0.72",
 * "relative risk of 0.85", "hazard ratios of 0.89"). Phrasings that push a noun
 * in between — "the odds ratio for readmission was 1.3" — are left to manual
 * entry rather than guessed at.
 */
const RATIO_RE =
  /\b(?:(a?(?:RR|HR|OR))|([Rr]elative\s+[Rr]isks?|[Hh]azard\s+[Rr]atios?|[Oo]dds\s+[Rr]atios?))\b\s*(?:(?:=|of|was|were|:)\s*)?(\d+(?:\.\d+)?)(?:\s*(?:[([;,]\s*)?95\s?%\s?(?:CI|[Cc]onfidence\s+[Ii]nterval)[,:]?\s*(\d+(?:\.\d+)?)\s*(?:[–—-]|to)\s*(\d+(?:\.\d+)?))?(?:[\s)\];,]{0,4}([Pp]\s?[=<]\s?0?\.\d+))?/g;

function toMeasure(
  abbreviation: string | undefined,
  spelled: string | undefined,
): RatioMeasure | null {
  if (abbreviation !== undefined) {
    // Drops the adjusted "a" prefix: aHR -> HR.
    const core = abbreviation.slice(-2).toUpperCase();
    if (core === 'RR' || core === 'HR' || core === 'OR') return core;
    return null;
  }
  if (spelled !== undefined) {
    // Plural: real abstracts report several at once ("hazard ratios of 0.89 ... and 0.94").
    const normalized = spelled.toLowerCase().replace(/\s+/g, ' ').replace(/s$/, '');
    if (normalized === 'relative risk') return 'RR';
    if (normalized === 'hazard ratio') return 'HR';
    if (normalized === 'odds ratio') return 'OR';
  }
  return null;
}

function toOptionalNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectRatios(text: string, spans: SentenceSpan[], out: NumberCandidate[]): void {
  RATIO_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RATIO_RE.exec(text)) !== null) {
    const raw = match[0];
    const measure = toMeasure(match[1], match[2]);
    const estimate = toOptionalNumber(match[3]);
    if (measure === null || estimate === null) continue;

    const ciLow = toOptionalNumber(match[4]);
    const ciHigh = toOptionalNumber(match[5]);
    const pValueText = match[6];

    const start = match.index;
    const end = start + raw.length;
    const sentenceIndex = sentenceIndexAt(spans, start);
    if (sentenceIndex === -1) continue;

    out.push({
      kind: 'ratio',
      raw,
      start,
      end,
      sentence: spans[sentenceIndex]?.text ?? '',
      measure,
      estimate,
      // Kept verbatim so "<" survives to the summary: "P<.001" is not "P=0.001".
      pValue: pValueText === undefined ? null : pValueText.trim(),
      ciLow: ciLow !== null && ciHigh !== null ? ciLow : null,
      ciHigh: ciLow !== null && ciHigh !== null ? ciHigh : null,
    });
  }
}

/* ------------------------------------------------------ dedupe and ordering */

/** Higher wins when two candidates overlap: the more specific reading survives. */
function specificity(candidate: NumberCandidate): number {
  switch (candidate.kind) {
    case 'ratio':
      return candidate.ciLow !== null ? 5 : 4;
    case 'fraction-pair':
      return 3;
    case 'percent-pair':
      return candidate.connector === 'and' ? 1 : 2;
  }
}

function isWeakPercentPair(candidate: NumberCandidate): boolean {
  return candidate.kind === 'percent-pair' && candidate.connector === 'and';
}

function overlaps(a: NumberCandidate, b: NumberCandidate): boolean {
  return a.start < b.end && b.start < a.end;
}

function dedupeCandidates(candidates: NumberCandidate[]): NumberCandidate[] {
  const ranked = [...candidates].sort((a, b) => {
    const bySpecificity = specificity(b) - specificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    const byLength = b.end - b.start - (a.end - a.start);
    if (byLength !== 0) return byLength;
    return a.start - b.start;
  });

  const kept: NumberCandidate[] = [];
  for (const candidate of ranked) {
    if (kept.some((other) => overlaps(candidate, other))) continue;
    kept.push(candidate);
  }
  return kept;
}

function byDocumentOrder(a: NumberCandidate, b: NumberCandidate): number {
  return a.start - b.start || a.end - b.end;
}

/* -------------------------------------------------------------- public API */

/**
 * Finds every percent pair, fraction pair and ratio in `text`.
 *
 * Candidates come back in document order, minus overlaps, except that bare
 * "X% and Y%" pairs are listed last: they are the weakest signal and should not
 * sit above a "vs" pair in the Numbers tab (issue #1 B9).
 *
 * `start` / `end` are exact offsets into `text`, so
 * `text.slice(c.start, c.end) === c.raw` always holds.
 */
export function extractNumberCandidates(text: string): NumberCandidate[] {
  if (text.length === 0) return [];

  const spans = splitSentences(text);
  const found: NumberCandidate[] = [];
  collectPercentPairs(text, spans, found);
  collectFractionSlashPairs(text, spans, found);
  collectFractionOfPairs(text, spans, found);
  collectFractionProsePairs(text, spans, found);
  collectRatios(text, spans, found);

  const kept = dedupeCandidates(found);
  const strong = kept.filter((candidate) => !isWeakPercentPair(candidate)).sort(byDocumentOrder);
  const weak = kept.filter(isWeakPercentPair).sort(byDocumentOrder);
  return [...strong, ...weak];
}

export type { FractionPairCandidate, PercentPairCandidate, RatioCandidate, RatioMeasure };
