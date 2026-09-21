/**
 * The one-page journal club summary (issue #19, SPEC.ja.md §4.5).
 *
 * Two renderings of one document: Markdown for pasting into a slide deck or a
 * wiki, and plain text for an email or a chat window. Both walk the same fixed
 * section order and the same content functions, so they can never drift apart
 * in what they say — only in how it is punctuated.
 *
 * Three rules from the spec drive most of the decisions here:
 *
 *  1. Every section is emitted even when it is empty. The value of the product
 *     is the complete template with the gaps visible: a summary that silently
 *     drops the validity table because nothing was answered hides exactly the
 *     part of the appraisal that was skipped.
 *  2. Where no absolute effect could be computed the export says so in words,
 *     and says which of the two reasons applies. "Absolute effect not reported
 *     in the abstract." is the one sentence this module is allowed to assert
 *     about a study — an abstract that stops at a hazard ratio is the failure
 *     mode journal clubs keep repeating — so it is reserved for the case where
 *     a relative effect was actually recorded. An appraisal nobody has filled in
 *     gets "not calculated in this appraisal" instead, which claims nothing
 *     about the paper.
 *  3. The bottom line is copied out verbatim and never generated. Nothing in
 *     this file writes a conclusion, a recommendation or an interpretation
 *     (spec §2, §9).
 *
 * Pure module: no chrome.*, no DOM. `src/ui/labels.ts` is imported for the
 * user-facing names, which is data only — keeping one copy of "Randomized
 * controlled trial" for the panel and the export.
 */
import { getChecklist } from './checklist-schema';
import { formatNnt } from './effect-measures';
import type {
  Appraisal,
  CitationFields,
  DesignEvidence,
  EffectMeasures,
  NumbersState,
  StudyDesign,
  Verdict,
} from './types';
import {
  CONFIDENCE_LABELS,
  DESIGN_OPTION_LABELS,
  DISCLAIMER,
  PICO_LABELS,
  PRODUCT_NAME,
  VERDICT_LABELS,
  designLabel,
} from '../ui/labels';

export interface SummaryOptions {
  /** Appears in the closing disclaimer; normally `PRODUCT_NAME`. */
  productName: string;
}

/* -------------------------------------------------------------- fixed copy */

/**
 * Spec §4.5. The literal sentence, not a placeholder to be reworded lightly.
 * It asserts something about the *paper*, so it is only used when that assertion
 * is true: the appraisal recorded a relative effect and no absolute one.
 */
const ABSOLUTE_EFFECT_MISSING = 'Absolute effect not reported in the abstract.';

/**
 * The other reason the absolute effect can be missing: nobody worked it out yet.
 * Saying "not reported in the abstract" there would be a false claim about the
 * study — an abstract giving "67.4% vs 77.3%" reports everything needed — and a
 * summary carried into a journal club must not put words in a paper's mouth.
 */
const ABSOLUTE_EFFECT_NOT_CALCULATED = 'Absolute effect not calculated in this appraisal.';

const UNTITLED = 'Untitled';
const NO_CITATION = 'Citation not recorded.';
const EMPTY_CELL = '—';
const NO_NOTE = '(no note)';
const NOTHING_FLAGGED = 'None.';
const NUMBER_NOTES_HEADING = 'Notes on these numbers:';
const VALIDITY_NOTES_HEADING = 'Notes on items answered No or Unclear:';
const SET_MANUALLY = 'Set manually.';
const NOT_DETECTED =
  'No design was detected from the publication type or the abstract keywords, so the general checklist is used below.';

/** Enough to identify the paper; the full list belongs in the reference manager. */
const MAX_AUTHORS_SHOWN = 3;

/** v0.1 has no AI, so section 7 ships as a template the group fills in live. */
const DISCUSSION_TEMPLATE_LINES = 3;

const EVIDENCE_KIND_LABELS: Record<DesignEvidence['kind'], string> = {
  'publication-type': 'publication type',
  keyword: 'abstract keyword',
};

const PUBMED_URL = 'https://pubmed.ncbi.nlm.nih.gov/';
const DOI_URL = 'https://doi.org/';

/* ------------------------------------------------------------------ helpers */

/** One label/value pair; a null label means the value stands on its own line. */
interface Row {
  label: string | null;
  value: string;
}

interface ValidityRow {
  /** 1-based position in the checklist; the notes below the table refer to it. */
  position: number;
  question: string;
  verdict: string;
}

type LinkRenderer = (text: string, url: string) => string;

const markdownLink: LinkRenderer = (text, url) => `[${text}](${url})`;
const plainLink: LinkRenderer = (text, url) => `${text} (${url})`;

/** Collapses the line breaks a textarea allows, so a value can sit in one cell. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cell(text: string): string {
  return oneLine(text) === '' ? EMPTY_CELL : oneLine(text);
}

/**
 * A pipe typed into a PICO field or a note would otherwise be read as a cell
 * border and shift every later column of that row.
 */
function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** `0.264` -> `26.4%`. One decimal: an abstract never supports more. */
function formatPercent(rate: number): string {
  return `${formatFixed(rate * 100)}%`;
}

/** Keeps `-0.0` out of the output when a bound sits exactly on no effect. */
function formatFixed(value: number): string {
  return (value === 0 ? 0 : value).toFixed(1);
}

/** Warnings and citation fragments arrive unpunctuated; an export reads as prose. */
function endWithPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function joinSentences(parts: readonly string[]): string {
  return parts.map(endWithPeriod).join(' ');
}

/* ------------------------------------------------------------------ content */

function title(a: Appraisal): string {
  return oneLine(a.citation.title) === '' ? UNTITLED : oneLine(a.citation.title);
}

function formatAuthors(authors: readonly string[]): string {
  const names = authors.map(oneLine).filter((name) => name !== '');
  if (names.length === 0) return '';
  const shown = names.slice(0, MAX_AUTHORS_SHOWN);
  if (names.length > MAX_AUTHORS_SHOWN) shown.push('et al');
  return shown.join(', ');
}

function doiUrl(doi: string): string {
  return doi.startsWith('http') ? doi : `${DOI_URL}${doi}`;
}

/** Section 1: everything needed to find the paper again, in one line. */
function citationLine(citation: CitationFields, pmid: string, link: LinkRenderer): string {
  const parts: string[] = [];
  const authors = formatAuthors(citation.authors);
  if (authors !== '') parts.push(authors);
  if (oneLine(citation.journal) !== '') parts.push(oneLine(citation.journal));
  if (oneLine(citation.year) !== '') parts.push(oneLine(citation.year));
  if (oneLine(pmid) !== '') {
    const id = oneLine(pmid);
    parts.push(`PMID ${link(id, `${PUBMED_URL}${id}/`)}`);
  }
  const doi = oneLine(citation.doi ?? '');
  if (doi !== '') parts.push(`DOI ${link(doi, doiUrl(doi))}`);
  return parts.length === 0 ? NO_CITATION : joinSentences(parts);
}

/** Section 2. */
function picoRows(a: Appraisal): Row[] {
  return [
    { label: PICO_LABELS.P, value: a.pico.p },
    { label: PICO_LABELS.I, value: a.pico.i },
    { label: PICO_LABELS.C, value: a.pico.c },
    { label: PICO_LABELS.O, value: a.pico.o },
  ];
}

/** What the rest of the export is appraised as: the user's choice wins. */
function effectiveDesign(a: Appraisal): StudyDesign {
  return a.designOverride ?? a.designDetected?.design ?? 'unclear';
}

function designHeadline(a: Appraisal): string {
  // A manual override carries no subtype: the user picked a design, not a shape
  // of trial, so claiming "(parallel)" on their behalf would invent detail. It
  // also uses the option wording, because "Not detected" is a statement about
  // the classifier and reads wrong next to a design the user chose by hand.
  if (a.designOverride !== null) return DESIGN_OPTION_LABELS[a.designOverride];
  return designLabel(effectiveDesign(a), a.designDetected?.subtype ?? null);
}

/** Section 3, second line: where the design came from, and on what evidence. */
function detectionLine(a: Appraisal): string {
  if (a.designOverride !== null) return SET_MANUALLY;
  const detected = a.designDetected;
  if (detected === null) return NOT_DETECTED;

  const source = `${CONFIDENCE_LABELS[detected.confidence]}.`;
  if (detected.evidence.length === 0) return source;
  const evidence = detected.evidence
    .map((item) => `${item.value} (${EVIDENCE_KIND_LABELS[item.kind]})`)
    .join(', ');
  return `${source} Evidence: ${evidence}.`;
}

/** The relative effect as the user typed it, so the reader can check our maths. */
function relativeEffectLine(numbers: NumbersState | null): string | null {
  if (numbers === null || numbers.mode !== 'ratio') return null;
  const ratio = numbers.inputs.ratio;
  const estimate = oneLine(ratio.estimate);
  if (estimate === '') return null;
  const low = oneLine(ratio.ciLow);
  const high = oneLine(ratio.ciHigh);
  const ci = low !== '' && high !== '' ? ` (95% CI ${low}–${high})` : '';
  return `${ratio.measure} ${estimate}${ci}`;
}

function riskDifferenceRow(result: EffectMeasures): Row {
  // ARR is cer − eer, so a harmful result is a negative ARR. It is reported as a
  // positive risk *increase* instead, and its interval is flipped to match, so
  // the sign of the number always agrees with the label next to it.
  const harm = result.direction === 'harm';
  const sign = harm ? -1 : 1;
  const label = harm ? 'ARI (absolute risk increase)' : 'ARR (absolute risk reduction)';
  const point = `${formatFixed(result.arr * sign * 100)} percentage points`;

  const ci = result.ci;
  if (ci === null) return { label, value: point };
  const bounds = [ci.arrLow * sign * 100, ci.arrHigh * sign * 100];
  const low = Math.min(...bounds);
  const high = Math.max(...bounds);
  return { label, value: `${point} (95% CI ${formatFixed(low)} to ${formatFixed(high)})` };
}

function relativeChangeRow(result: EffectMeasures): Row {
  const harm = result.direction === 'harm';
  const label = harm ? 'RRI (relative risk increase)' : 'RRR (relative risk reduction)';
  if (!Number.isFinite(result.rrr)) {
    return { label, value: 'not calculable (no events in the control group)' };
  }
  return { label, value: formatPercent(Math.abs(result.rrr)) };
}

/** Section 4. */
function keyResultRows(numbers: NumbersState | null): Row[] {
  const rows: Row[] = [];

  const relative = relativeEffectLine(numbers);
  if (relative !== null) rows.push({ label: 'Reported relative effect', value: relative });

  const result = numbers?.result ?? null;
  if (result === null) {
    // A relative effect was recorded but no absolute one, so the abstract really
    // did stop at a ratio. Without one, nothing is known about what the abstract
    // reports — only that this appraisal has not got there yet.
    rows.push({
      label: null,
      value: relative === null ? ABSOLUTE_EFFECT_NOT_CALCULATED : ABSOLUTE_EFFECT_MISSING,
    });
    return rows;
  }

  const assumed = numbers !== null && numbers.mode === 'ratio';
  rows.push({
    label: assumed ? 'CER (assumed control event rate)' : 'CER (control event rate)',
    value: formatPercent(result.cer),
  });
  rows.push({ label: 'EER (experimental event rate)', value: formatPercent(result.eer) });
  rows.push(riskDifferenceRow(result));
  rows.push(relativeChangeRow(result));
  rows.push({ label: null, value: formatNnt(result) });
  return rows;
}

function numberNotes(numbers: NumbersState | null): string[] {
  return (numbers?.warnings ?? [])
    .map(oneLine)
    .filter((warning) => warning !== '')
    .map(endWithPeriod);
}

/** Section 5: the checklist for the effective design, answered or not. */
function validityModel(a: Appraisal): { rows: ValidityRow[]; notes: string[] } {
  const checklist = getChecklist(effectiveDesign(a));
  const answers = a.validity[checklist.id] ?? {};
  const rows: ValidityRow[] = [];
  const notes: string[] = [];

  checklist.items.forEach((item, index) => {
    const position = index + 1;
    const verdict: Verdict | null = answers[item.id]?.verdict ?? null;
    rows.push({
      position,
      question: item.question,
      verdict: verdict === null ? EMPTY_CELL : VERDICT_LABELS[verdict],
    });

    // Only No and Unclear reach the notes list: those are the items the group is
    // there to argue about. An unanswered item is a gap, not a finding, so its
    // note stays in the panel.
    if (verdict !== 'no' && verdict !== 'unclear') return;
    const note = oneLine(answers[item.id]?.note ?? '');
    notes.push(`Item ${position} (${VERDICT_LABELS[verdict]}): ${note === '' ? NO_NOTE : note}`);
  });

  return { rows, notes: notes.length === 0 ? [NOTHING_FLAGGED] : notes };
}

/** Section 7: the questions, or three blank lines to write them on. */
function discussionLines(a: Appraisal): string[] {
  const questions = a.discussionQuestions.map(oneLine).filter((question) => question !== '');
  if (questions.length === 0) {
    return Array.from({ length: DISCUSSION_TEMPLATE_LINES }, (_, index) => `${index + 1}.`);
  }
  return questions.map((question, index) => `${index + 1}. ${question}`);
}

/** Section 8, always last. */
function disclaimer(opts: SummaryOptions): string {
  return DISCLAIMER.replace(PRODUCT_NAME, opts.productName);
}

/* ----------------------------------------------------------------- Markdown */

function markdownTable(headers: readonly string[], rows: readonly string[][]): string[] {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) {
    lines.push(`| ${row.map((value) => escapePipes(cell(value))).join(' | ')} |`);
  }
  return lines;
}

function markdownRows(rows: readonly Row[]): string[] {
  return rows.map((row) =>
    row.label === null ? `- ${row.value}` : `- ${row.label}: ${row.value}`,
  );
}

/**
 * Markdown export: the eight sections of spec §4.5 in order, blank ones
 * included, disclaimer last.
 */
export function buildSummaryMarkdown(a: Appraisal, opts: SummaryOptions): string {
  const validity = validityModel(a);
  const blocks: string[][] = [
    [`# ${title(a)}`],
    [citationLine(a.citation, a.pmid, markdownLink)],

    ['## Clinical question (PICO)'],
    markdownTable(
      ['Element', 'Detail'],
      picoRows(a).map((row) => [row.label ?? '', row.value]),
    ),

    ['## Study design'],
    [`**${designHeadline(a)}**`],
    [detectionLine(a)],

    ['## Key results'],
    markdownRows(keyResultRows(a.numbers)),
  ];

  const notes = numberNotes(a.numbers);
  if (notes.length > 0) {
    blocks.push([NUMBER_NOTES_HEADING]);
    blocks.push(notes.map((note) => `- ${note}`));
  }

  blocks.push(['## Validity']);
  blocks.push(
    markdownTable(
      ['#', 'Item', 'Verdict'],
      validity.rows.map((row) => [String(row.position), row.question, row.verdict]),
    ),
  );
  blocks.push([VALIDITY_NOTES_HEADING]);
  blocks.push(validity.notes.map((note) => `- ${note}`));

  blocks.push(['## Bottom line']);
  // Verbatim, or nothing at all: the blank space is the prompt to write one.
  blocks.push(a.bottomLine.trim() === '' ? [] : [a.bottomLine.trim()]);

  blocks.push(['## Discussion questions']);
  blocks.push(discussionLines(a));

  blocks.push([disclaimer(opts)]);

  return `${blocks
    .map((block) => block.join('\n'))
    .filter((block) => block !== '')
    .join('\n\n')}\n`;
}

/* --------------------------------------------------------------- plain text */

const INDENT = '  ';

/** Lines the verdict up under the question text of a numbered checklist item. */
const VERDICT_INDENT = '   ';

function indent(lines: readonly string[], depth = 1): string[] {
  return lines.map((line) => (line === '' ? '' : `${INDENT.repeat(depth)}${line}`));
}

/** `Label:` columns padded to line up, values that stand alone left as they are. */
function alignedRows(rows: readonly Row[]): string[] {
  let width = 0;
  for (const row of rows) {
    if (row.label !== null) width = Math.max(width, row.label.length + 1);
  }
  return rows.map((row) =>
    row.label === null ? row.value : `${`${row.label}:`.padEnd(width + 1)}${row.value}`,
  );
}

function textSection(heading: string, lines: readonly string[]): string[] {
  return [heading, ...indent(lines)];
}

/**
 * Plain-text export: identical content and order to the Markdown one, with no
 * Markdown syntax anywhere — indentation and `Label: value` lines instead of
 * headings, tables and emphasis, for an email or a chat window that would show
 * the punctuation raw.
 */
export function buildSummaryText(a: Appraisal, opts: SummaryOptions): string {
  const validity = validityModel(a);
  const lines: string[] = [title(a), citationLine(a.citation, a.pmid, plainLink), ''];

  lines.push(
    ...textSection(
      'CLINICAL QUESTION (PICO)',
      alignedRows(picoRows(a).map((row) => ({ label: row.label, value: cell(row.value) }))),
    ),
  );
  lines.push('');

  lines.push(...textSection('STUDY DESIGN', [designHeadline(a), detectionLine(a)]));
  lines.push('');

  const keyResults = alignedRows(keyResultRows(a.numbers));
  const notes = numberNotes(a.numbers);
  if (notes.length > 0) keyResults.push(NUMBER_NOTES_HEADING, ...indent(notes));
  lines.push(...textSection('KEY RESULTS', keyResults));
  lines.push('');

  const validityLines: string[] = [];
  for (const row of validity.rows) {
    validityLines.push(`${row.position}. ${oneLine(row.question)}`);
    validityLines.push(`${VERDICT_INDENT}Verdict: ${row.verdict}`);
  }
  validityLines.push(VALIDITY_NOTES_HEADING, ...indent(validity.notes));
  lines.push(...textSection('VALIDITY', validityLines));
  lines.push('');

  const bottomLine = a.bottomLine.trim();
  lines.push(...textSection('BOTTOM LINE', bottomLine === '' ? [] : bottomLine.split('\n')));
  lines.push('');

  lines.push(...textSection('DISCUSSION QUESTIONS', discussionLines(a)));
  lines.push('');

  lines.push(disclaimer(opts));
  return `${lines.join('\n')}\n`;
}
