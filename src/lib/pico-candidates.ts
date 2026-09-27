/**
 * Heuristic P / I / C / O candidates for a PubMed abstract (issue #16, spec §2-3, §3-4).
 *
 * v0.1 has no AI and no auto-fill. The PICO tab highlights these spans inside the
 * abstract and the user clicks the ones they want (#17), or just selects arbitrary
 * text by hand. That asymmetry decides the tuning: a wrong candidate costs the user
 * a moment of reading, a missing one costs nothing at all. So this module prefers
 * precision over recall — fixed cue phrases taken from how trial abstracts are
 * actually written, no inference about meaning, structured sections consulted by
 * label so that "compared with" in the conclusions is not offered as a comparator,
 * and anything that cannot be located in the abstract is dropped rather than
 * emitted with a guessed offset.
 *
 * Offsets are the contract. For every candidate drawn from the abstract,
 * `abstract.slice(candidate.start, candidate.end) === candidate.text` holds exactly;
 * the tab renders <mark> elements from those numbers and one character of drift
 * shows up as visibly mangled text.
 *
 * Title convention: the title is not part of the abstract, so a title candidate
 * cannot carry offsets that index into it. It uses `start === end === TITLE_OFFSET`
 * (-1) together with `reason === 'title'`. A negative offset can never collide with
 * a real span, and `abstract.slice(-1, -1)` is the empty string, so a consumer that
 * renders from the offsets without checking highlights nothing instead of the wrong
 * text. Check `candidate.start < 0` (or `reason === 'title'`) before highlighting.
 *
 * Pure module: no `chrome.*`, no DOM.
 */

import { extractNumberCandidates, type NumberCandidate } from './number-extractor';
import type { AbstractSection, PicoCandidate, PicoField, PubMedArticle } from './types';

export type { PicoCandidate, PicoField } from './types';

/** Offsets of a candidate that comes from the title instead of the abstract. */
export const TITLE_OFFSET = -1;

const MAX_PHRASE_LENGTH = 120;
const MAX_CANDIDATES_PER_FIELD = 5;
/** Shortest cue is "men"; anything below that is noise, not a phrase. */
const MIN_PHRASE_LENGTH = 3;

const FIELD_ORDER: readonly PicoField[] = ['P', 'I', 'C', 'O'] as const;
/** The documented layout of `PubMedArticle.abstract` (see types.ts). */
const SECTION_SEPARATOR = '\n\n';

/* ---------------------------------------------------------------------- cues */

/**
 * Each alternative is a literal phrase, so the patterns stay linear: no nested
 * quantifiers, nothing that can backtrack over a long abstract.
 */
const CUE_PATTERNS: Readonly<Record<PicoField, RegExp>> = {
  P: /\b(?:patients with|adults with|children with|participants|women|men)\b/gi,
  I: /\b(?:were randomi[sz]ed to|received|assigned to|treated with|intervention)\b/gi,
  C: /\b(?:placebo|usual care|standard care|control group|compared with|versus)\b/gi,
  O: /\b(?:primary outcomes?|primary end ?points?|outcome was|measured)\b/gi,
};

/**
 * Structured abstracts label their sections, and the label is the cheapest
 * precision filter available: population wording in CONCLUSIONS is a restatement,
 * and "versus" in RESULTS is a number pair, not the comparator arm.
 */
const METHODS_LABEL_RE =
  /\b(?:methods?|participants?|patients?|subjects?|population|design|setting|interventions?|exposures?)\b/i;
const RESULTS_LABEL_RE = /\b(?:results?|findings?)\b/i;
/** Outcome wording sits in METHODS, in RESULTS, or in a "MAIN OUTCOMES AND MEASURES" section. */
const OUTCOME_LABEL_RE = /\b(?:methods?|outcomes?|measures?|end ?points?|results?|findings?)\b/i;

/**
 * Sections whose label names the population outright, as opposed to the broader
 * METHODS group. A section headed PARTICIPANTS is about the population whether or
 * not any cue phrase appears inside it, so its opening phrase is offered directly.
 */
const POPULATION_LABEL_RE = /\b(?:participants?|patients?|subjects?|population)\b/i;

/* -------------------------------------------------------------------- scopes */

interface Scope {
  label: string;
  start: number;
  end: number;
}

/**
 * Maps each abstract section onto its offsets inside `abstract`.
 *
 * types.ts documents `abstract` as the sections joined with "\n\n", so that is
 * checked first and used when it holds. It does not always hold — a DOM scrape can
 * keep the labels inline ("METHODS: ...") or normalise whitespace — so the fallback
 * locates each section's text inside the abstract instead. A section that cannot be
 * found is skipped: better to lose its candidates than to shift every offset in it.
 */
function resolveScopes(abstract: string, sections: readonly AbstractSection[]): Scope[] {
  if (sections.length === 0) return [];

  const rejoined = sections.map((section) => section.text).join(SECTION_SEPARATOR);
  if (rejoined === abstract) {
    const scopes: Scope[] = [];
    let cursor = 0;
    for (const section of sections) {
      scopes.push({ label: section.label, start: cursor, end: cursor + section.text.length });
      cursor += section.text.length + SECTION_SEPARATOR.length;
    }
    return scopes;
  }

  const scopes: Scope[] = [];
  let cursor = 0;
  for (const section of sections) {
    const text = section.text;
    if (text.length === 0) continue;
    let index = abstract.indexOf(text, cursor);
    // Sections are normally in order; retry from the top before giving up.
    if (index === -1) index = abstract.indexOf(text);
    if (index === -1) continue;
    scopes.push({ label: section.label, start: index, end: index + text.length });
    cursor = index + text.length;
  }
  return scopes;
}

/* ------------------------------------------------------------ phrase capture */

function isSpace(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

/**
 * True when the space at `index` groups the thousands of one number, as in BMJ's
 * "18 061" (#49): a digit before it and exactly three digits after. Treating it
 * as a word break is what once started a candidate at "061 cases".
 */
function isGroupSeparator(text: string, index: number): boolean {
  return (
    text.charAt(index) === ' ' &&
    isDigit(text.charAt(index - 1)) &&
    isDigit(text.charAt(index + 1)) &&
    isDigit(text.charAt(index + 2)) &&
    isDigit(text.charAt(index + 3)) &&
    !isDigit(text.charAt(index + 4))
  );
}

function isWordBreak(text: string, index: number): boolean {
  return isSpace(text.charAt(index)) && !isGroupSeparator(text, index);
}

/** Moves `end` back to the end of the previous whole word, never before `floor`. */
function retreatToWordEnd(text: string, end: number, floor: number): number {
  let index = end;
  if (index < text.length && !isWordBreak(text, index)) {
    while (index > floor && !isWordBreak(text, index - 1)) index -= 1;
  }
  while (index > floor && isSpace(text.charAt(index - 1))) index -= 1;
  return index;
}

/** Moves `start` forward to the beginning of the next whole word, never past `ceiling`. */
function advanceToWordStart(text: string, start: number, ceiling: number): number {
  let index = start;
  if (index > 0 && !isWordBreak(text, index - 1)) {
    while (index < ceiling && !isWordBreak(text, index)) index += 1;
  }
  while (index < ceiling && isSpace(text.charAt(index))) index += 1;
  return index;
}

/**
 * End offset of the phrase that starts at `start`: up to the next comma or period,
 * capped at 120 characters.
 *
 * A semicolon and a line break end a phrase too — in abstracts both separate
 * clauses as firmly as a comma does. A period between two digits does not: cutting
 * "2.5 mg" down to "2" would be worse than no candidate at all.
 */
function captureEnd(text: string, start: number, scopeEnd: number): number {
  const hardLimit = Math.min(scopeEnd, start + MAX_PHRASE_LENGTH);
  let end = start;
  let stoppedAtBoundary = false;

  while (end < hardLimit) {
    const character = text.charAt(end);
    if (character === ',' || character === ';' || character === '\n' || character === '\r') {
      stoppedAtBoundary = true;
      break;
    }
    if (character === '.' && !(isDigit(text.charAt(end - 1)) && isDigit(text.charAt(end + 1)))) {
      stoppedAtBoundary = true;
      break;
    }
    end += 1;
  }

  if (!stoppedAtBoundary && end < scopeEnd) {
    // Truncated by the length cap rather than by punctuation: drop the partial word.
    const retreated = retreatToWordEnd(text, end, start);
    if (retreated > start) end = retreated;
  }
  while (end > start && isSpace(text.charAt(end - 1))) end -= 1;
  return end;
}

/* ------------------------------------------------------------ cue collection */

function normalizeCue(cue: string): string {
  return cue.toLowerCase().replace(/\s+/g, ' ');
}

function collectCueCandidates(
  abstract: string,
  scopes: readonly Scope[],
  field: PicoField,
  pattern: RegExp,
  out: PicoCandidate[],
): void {
  for (const scope of scopes) {
    pattern.lastIndex = scope.start;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(abstract)) !== null) {
      const cue = match[0];
      if (cue === undefined || cue.length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      const start = match.index;
      if (start >= scope.end) break;

      const end = captureEnd(abstract, start, scope.end);
      if (end - start < MIN_PHRASE_LENGTH) continue;
      out.push({
        field,
        text: abstract.slice(start, end),
        start,
        end,
        reason: normalizeCue(cue),
      });
    }
  }
}

/**
 * The opening phrase of a section that is labelled as the population.
 *
 * The cue list cannot carry this: PMID 34844936 opens its PARTICIPANTS section
 * with "Patients had a baseline eGFR between 10 and 20 mL/min/1.73 m2", which no
 * cue in CUE_PATTERNS.P matches, and that abstract otherwise yields no P
 * candidate at all. The section label is the stronger signal, so it is used
 * directly — and only for structured abstracts, never as a whole-text fallback.
 */
function collectPopulationSections(
  abstract: string,
  scopes: readonly Scope[],
  out: PicoCandidate[],
): void {
  for (const scope of scopes) {
    const start = advanceToWordStart(abstract, scope.start, scope.end);
    const end = captureEnd(abstract, start, scope.end);
    if (end - start < MIN_PHRASE_LENGTH) continue;
    out.push({
      field: 'P',
      text: abstract.slice(start, end),
      start,
      end,
      reason: `${scope.label.toLowerCase()} section`,
    });
  }
}

/* -------------------------------------------------- numeric result sentences */

interface SentenceSpan {
  start: number;
  end: number;
}

/**
 * Offsets of the sentence a number candidate sits in.
 *
 * `extractNumberCandidates` already carries the trimmed sentence text, so the
 * sentence boundaries are recovered by locating that text rather than by running a
 * second sentence splitter with slightly different rules about "vs." and "0.72".
 */
function locateSentence(abstract: string, candidate: NumberCandidate): SentenceSpan | null {
  const sentence = candidate.sentence;
  if (sentence.length === 0) return null;
  const start = abstract.lastIndexOf(sentence, candidate.start);
  if (start === -1 || start + sentence.length < candidate.end) return null;
  return { start, end: start + sentence.length };
}

/**
 * A window of at most 120 characters over `sentence` that still contains the number.
 *
 * Results sentences are long, and a window that clipped the figures off the end
 * would defeat the point of proposing the sentence at all.
 */
function windowAroundNumber(
  abstract: string,
  sentence: SentenceSpan,
  numberStart: number,
  numberEnd: number,
): SentenceSpan {
  if (sentence.end - sentence.start <= MAX_PHRASE_LENGTH) return sentence;

  if (numberEnd - sentence.start <= MAX_PHRASE_LENGTH) {
    const limit = sentence.start + MAX_PHRASE_LENGTH;
    const end = retreatToWordEnd(abstract, limit, sentence.start);
    return { start: sentence.start, end: Math.max(end, numberEnd) };
  }

  // The figures sit deep in the sentence: slide the window to keep them visible.
  const desired = Math.max(sentence.start, numberEnd - MAX_PHRASE_LENGTH);
  const start = advanceToWordStart(abstract, desired, numberStart);
  const limit = Math.min(sentence.end, start + MAX_PHRASE_LENGTH);
  const retreated = retreatToWordEnd(abstract, limit, start);
  return { start, end: retreated >= numberEnd ? retreated : limit };
}

function collectNumericResults(
  abstract: string,
  scopes: readonly Scope[],
  out: PicoCandidate[],
): void {
  for (const number of extractNumberCandidates(abstract)) {
    const scope = scopes.find((item) => number.start >= item.start && number.end <= item.end);
    if (scope === undefined) continue;

    const sentence = locateSentence(abstract, number);
    if (sentence === null) continue;
    // A sentence can run across a section break if a section is not punctuated.
    const clamped: SentenceSpan = {
      start: Math.max(sentence.start, scope.start),
      end: Math.min(sentence.end, scope.end),
    };
    if (clamped.start > number.start || clamped.end < number.end) continue;

    const window = windowAroundNumber(abstract, clamped, number.start, number.end);
    if (window.end - window.start < MIN_PHRASE_LENGTH) continue;
    out.push({
      field: 'O',
      text: abstract.slice(window.start, window.end),
      start: window.start,
      end: window.end,
      reason: 'numeric result',
    });
  }
}

/* --------------------------------------------------------- dedupe and title */

/** Keeps the longest of any group of overlapping spans; ties go to the earlier one. */
function dedupeOverlapping(candidates: readonly PicoCandidate[]): PicoCandidate[] {
  const ranked = [...candidates].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: PicoCandidate[] = [];
  for (const candidate of ranked) {
    if (kept.some((other) => candidate.start < other.end && other.start < candidate.end)) continue;
    kept.push(candidate);
  }
  return kept;
}

function titleCandidate(title: string, field: PicoField): PicoCandidate | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) return null;

  let text = trimmed;
  if (text.length > MAX_PHRASE_LENGTH) {
    const cut = retreatToWordEnd(trimmed, MAX_PHRASE_LENGTH, 0);
    text = trimmed.slice(0, cut > 0 ? cut : MAX_PHRASE_LENGTH);
  }
  return { field, text, start: TITLE_OFFSET, end: TITLE_OFFSET, reason: 'title' };
}

/* -------------------------------------------------------------- public API */

/**
 * Proposes P / I / C / O phrases for the PICO tab to highlight.
 *
 * Candidates are grouped by field in P, I, C, O order and are in document order
 * inside each field, with the title candidate — offered to P, I and C only — last
 * in its field and dropped when the field already holds five candidates. At most
 * five candidates per field; overlapping spans are collapsed to the longest.
 *
 * An empty or blank abstract returns `[]`, title or not: with nothing to highlight
 * the panel has nothing to show.
 */
export function findPicoCandidates(
  article: Pick<PubMedArticle, 'abstract' | 'abstractSections' | 'title'>,
): PicoCandidate[] {
  const abstract = article.abstract;
  if (abstract.trim().length === 0) return [];

  const wholeAbstract: Scope[] = [{ label: '', start: 0, end: abstract.length }];
  const sectionScopes = resolveScopes(abstract, article.abstractSections);
  /** Unstructured abstracts, and fields with no matching section, scan everything. */
  const scopesFor = (labelPattern: RegExp): Scope[] => {
    const matching = sectionScopes.filter((scope) => labelPattern.test(scope.label));
    return matching.length > 0 ? matching : wholeAbstract;
  };

  const methodsScopes = scopesFor(METHODS_LABEL_RE);
  const found: Record<PicoField, PicoCandidate[]> = { P: [], I: [], C: [], O: [] };

  collectPopulationSections(
    abstract,
    sectionScopes.filter((scope) => POPULATION_LABEL_RE.test(scope.label)),
    found.P,
  );
  collectCueCandidates(abstract, methodsScopes, 'P', CUE_PATTERNS.P, found.P);
  collectCueCandidates(abstract, methodsScopes, 'I', CUE_PATTERNS.I, found.I);
  collectCueCandidates(abstract, methodsScopes, 'C', CUE_PATTERNS.C, found.C);
  collectCueCandidates(abstract, scopesFor(OUTCOME_LABEL_RE), 'O', CUE_PATTERNS.O, found.O);
  collectNumericResults(abstract, scopesFor(RESULTS_LABEL_RE), found.O);

  const result: PicoCandidate[] = [];
  for (const field of FIELD_ORDER) {
    const kept = dedupeOverlapping(found[field])
      .sort((a, b) => a.start - b.start || a.end - b.end)
      // Last line of defence for the offset contract: an unlocatable span is dropped.
      .filter((candidate) => abstract.slice(candidate.start, candidate.end) === candidate.text)
      .slice(0, MAX_CANDIDATES_PER_FIELD);

    if (field !== 'O' && kept.length < MAX_CANDIDATES_PER_FIELD) {
      const fromTitle = titleCandidate(article.title, field);
      if (fromTitle !== null) kept.push(fromTitle);
    }
    result.push(...kept);
  }
  return result;
}
