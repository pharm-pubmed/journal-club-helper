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
 *     drops the appraisal table because nothing was answered hides exactly the
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
 * The critical-appraisal rework adds a fourth, which is about what the reader
 * is allowed to carry out of the room: the export must never let one verdict be
 * read as a bigger claim than it is. Internal validity and applicability are
 * kept in separate blocks because a well-run trial can still be about the wrong
 * patient; subtype-specific checks are labelled as additions so nobody reads
 * them as a lighter checklist; funding is recorded as fact with no verdict
 * column, because industry money is not itself a flaw; an Unclear is attributed
 * to the source the reader had rather than to the study; and a non-inferiority
 * result is fenced to the endpoint that was actually tested. The numbers get
 * the same treatment: an NNT read off the proportions of a case-control or
 * cross-sectional study carries the caveat from design-caveats.ts, so it
 * cannot leave the room looking like a risk difference.
 *
 * Pure module: no chrome.*, no DOM. `src/ui/labels.ts` is imported for the
 * user-facing names, which is data only — keeping one copy of "Randomized
 * controlled trial" for the panel and the export.
 */
import { getChecklist, itemsInSection, needsMoreThan } from './checklist-schema';
import { resultCaveat } from './design-caveats';
import { formatNnt } from './effect-measures';
import type {
  Appraisal,
  Checklist,
  ChecklistGroup,
  ChecklistItem,
  CitationFields,
  DesignEvidence,
  EffectMeasures,
  NumbersState,
  SourceScope,
  StudyDesign,
  Verdict,
} from './types';
import {
  CONFIDENCE_LABELS,
  DESIGN_OPTION_LABELS,
  DISCLAIMER,
  EVIDENCE_NEED_HINTS,
  PICO_LABELS,
  PRODUCT_NAME,
  SECTION_LABELS,
  SOURCE_SCOPE_LABELS,
  SUBTYPE_DESIGN_LINES,
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
const SET_MANUALLY = 'Set manually.';
const NOT_DETECTED =
  'No design was detected from the publication type or the abstract keywords, so the general checklist is used below.';

/** A part of the checklist that exists but has nothing in it, said out loud. */
const NO_ITEMS = 'No items in this part of the checklist.';

/* ------------------------------------------- critical appraisal, fixed copy */

const APPRAISAL_HEADING = 'Critical appraisal';
const FUNDING_HEADING = 'Funding & conflicts';
const NOTES_HEADING = 'Notes on flagged items';

/**
 * What the appraisal was actually read from. Printed before any verdict,
 * because every verdict below has to be read through it.
 */
function appraisedFromLine(scope: SourceScope): string {
  return `Appraised from: ${SOURCE_SCOPE_LABELS[scope]}.`;
}

/**
 * The single most important sentence in the rework. This document gets carried
 * into a room and argued from, and an Unclear that reads as a fault found in
 * the study turns an absence of reporting into a criticism it has no evidence for.
 * "Not reported" is Unclear, and Unclear is a statement about the reader.
 */
const UNCLEAR_IS_A_LIMIT =
  'An Unclear verdict means the source above does not settle that question: it records a limit ' +
  'on what the reader could check, not a fault found in the study. Where an item was checked ' +
  'against a different document, that source is shown beside its verdict.';

/** Printed at the head of every subtype-specific block, without exception. */
const GROUP_IS_ADDITIONAL =
  'These checks are additional. Every item under Internal validity still applies to this trial; ' +
  'nothing above is replaced or relaxed by what follows.';

/**
 * The guardrail this section exists for. A non-inferiority trial demonstrates
 * one thing: that on the outcome it powered, against the margin it fixed in
 * advance, the new treatment was not worse by more than that margin. Readers
 * routinely stretch it into "as good as", into "better", and — the case this
 * wording comes from — onto a second endpoint that produced no events in either
 * arm and was never part of the pre-specified non-inferiority test.
 *
 * The caution deliberately does not say that zero events rules non-inferiority
 * out. On a risk-difference margin with enough participants, two arms with no
 * events can sit comfortably inside the margin. What decides it is the effect
 * measure, the margin and the precision reached — and, before any of that,
 * whether the outcome was pre-specified as a non-inferiority endpoint at all.
 */
const NON_INFERIORITY_CAUTION =
  'Carry this result no further than the outcome it was tested on. A non-inferiority finding ' +
  'belongs to one pre-specified endpoint and one pre-specified margin: it is not a finding of ' +
  'equivalence, it is not a finding of superiority, and it says nothing about any other endpoint. ' +
  'An outcome that was not part of that pre-specified test carries no non-inferiority claim, ' +
  'however few events it recorded; where an outcome had no events in either arm, check what was ' +
  'pre-specified and how precise the estimate is before reading anything into it.';

/** Applicability is a separate question, and the export says which is which. */
const APPLICABILITY_IS_NOT_VALIDITY =
  'Applicability is not internal validity. A trial can be conducted impeccably and still not ' +
  'transfer to the patient in front of you, and a trial with real methodological weaknesses can ' +
  'still be about exactly your patient. Nothing below is a verdict on how the study was run.';

/** Facts, not a score. Both halves of that sentence matter. */
const FUNDING_IS_NOT_SCORED =
  'Recorded as fact, never scored. Industry funding is not by itself a source of bias, and a ' +
  'field left blank means nothing was recorded here — not that there was nothing to record.';

const NOT_RECORDED = 'Not recorded.';

const NOTES_NO_HEADING =
  'Items answered No — judgements the reader made, about the study or about its fit:';
const NOTES_UNCLEAR_HEADING =
  'Items answered Unclear — the source used does not settle these, which is not a finding ' +
  'against the study:';

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

interface AppraisalRow {
  /** 1-based position, running across every block; the notes refer to it. */
  position: number;
  question: string;
  verdict: string;
}

/** One `###` block of the critical-appraisal section: prose, then a table. */
interface AppraisalBlock {
  title: string;
  /** Sentences printed between the heading and the table. */
  lead: string[];
  rows: AppraisalRow[];
}

interface AppraisalModel {
  sourceLines: string[];
  blocks: AppraisalBlock[];
  funding: Row[];
  /** "Item 3: ..." lines, split because a No and an Unclear are different claims. */
  noNotes: string[];
  unclearNotes: string[];
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

/**
 * The subtype decides whether a whole extra block of checks appears, so where it
 * came from matters. An explicit `subtypeOverride` is the user saying "this is a
 * non-inferiority trial" and wins outright. Failing that, a manual *design*
 * override carries no subtype at all: the user picked a design, not a shape of
 * trial, and reading "non-inferiority" back out of a stale detection would
 * switch those checks on in their name.
 */
function effectiveSubtype(a: Appraisal): string | null {
  const chosen = oneLine(a.subtypeOverride ?? '');
  if (chosen !== '') return chosen;
  if (a.designOverride !== null) return null;
  return a.designDetected?.subtype ?? null;
}

function checklistFor(a: Appraisal): Checklist {
  return getChecklist(effectiveDesign(a), effectiveSubtype(a));
}

/**
 * Section 3, first line. The subtype no longer rides along in a parenthesis:
 * "Randomized controlled trial (non-inferiority)" reads as a kind of trial you
 * can skim past, where a line of its own is a design decision the reader has to
 * account for.
 */
function designHeadline(a: Appraisal): string {
  // The option wording is used for an override, because "Not detected" is a
  // statement about the classifier and reads wrong next to a design the user
  // chose by hand.
  if (a.designOverride !== null) return DESIGN_OPTION_LABELS[a.designOverride];
  return designLabel(effectiveDesign(a), null);
}

/**
 * Section 3, second line: the subtype, standing on its own.
 *
 * A subtype the user typed in is marked as such, because it is what turned the
 * subtype-specific checks on and the reader is entitled to know the classifier
 * did not find it. The mark is dropped when the design was overridden too —
 * the detection line already says the whole block was set by hand.
 */
function subtypeLine(a: Appraisal): string | null {
  const subtype = effectiveSubtype(a);
  if (subtype === null) return null;
  const label = SUBTYPE_DESIGN_LINES[subtype] ?? subtype;
  const chosen = oneLine(a.subtypeOverride ?? '') !== '' && a.designOverride === null;
  return chosen ? `${label} (set manually)` : label;
}

/** Section 3, last line: where the design came from, and on what evidence. */
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

/**
 * The design caveat leads the notes, and only when there is a result for it to
 * qualify. It is read from the design in force at export time rather than
 * stored with the result, so overriding the design afterwards still reaches
 * the export.
 */
function numberNotes(a: Appraisal): string[] {
  const numbers = a.numbers;
  const caveat =
    numbers === null || numbers.result === null
      ? null
      : resultCaveat(effectiveDesign(a), numbers.mode);
  return [...(caveat === null ? [] : [caveat]), ...(numbers?.warnings ?? [])]
    .map(oneLine)
    .filter((warning) => warning !== '')
    .map(endWithPeriod);
}

/* ------------------------------------------------------ critical appraisal */

/**
 * The verdict cell. A per-item source only shows when it actually departs from
 * the appraisal's default, so the column stays quiet until it has something to
 * say: an item recorded against the same source as everything else is not an
 * override and printing it would bury the ones that are.
 */
function verdictCell(verdict: Verdict | null, override: SourceScope | null): string {
  const label = verdict === null ? EMPTY_CELL : VERDICT_LABELS[verdict];
  if (override === null) return label;
  return `${label} (source: ${SOURCE_SCOPE_LABELS[override]})`;
}

/**
 * True for the block of checks a non-inferiority design switches on. The group's
 * declared subtypes are the reliable signal — `applicableGroups` matches on the
 * same field — with the id as a second chance in case a group is ever keyed
 * differently.
 */
function isNonInferiorityGroup(group: ChecklistGroup): boolean {
  return group.subtypes.includes('non-inferiority') || group.id.includes('non-inferiority');
}

/**
 * `group.note` is deliberately not printed. It is written for the panel, where
 * the general items sit in one list; the export splits applicability out into
 * its own block, so a note counting "the nine general items" would contradict
 * the eight numbered above it. `GROUP_IS_ADDITIONAL` makes the same promise in
 * terms of what the export actually shows, and makes it for every group rather
 * than only for the ones whose JSON happens to say so.
 */
function groupLead(group: ChecklistGroup): string[] {
  const lead = [GROUP_IS_ADDITIONAL];
  if (isNonInferiorityGroup(group)) lead.push(NON_INFERIORITY_CAUTION);
  return lead;
}

/** Facts from `checklist.info`, filled in from `appraisal.info`, never scored. */
function fundingRows(checklist: Checklist, a: Appraisal): Row[] {
  const fields = checklist.info?.fields ?? [];
  // No panel at all still gets a line: a missing block would read as "nothing to
  // declare", which is the one thing an absent answer must never say.
  if (fields.length === 0) return [{ label: null, value: NOT_RECORDED }];
  return fields.map((field) => {
    const recorded = oneLine(a.info[field.id] ?? '');
    return { label: field.label, value: recorded === '' ? NOT_RECORDED : recorded };
  });
}

/**
 * Section 5: the checklist for the effective design, answered or not, split
 * into internal validity, then any subtype-specific blocks, then applicability.
 * Positions run continuously across all three so a note can say "Item 9" and
 * mean exactly one row.
 */
function appraisalModel(a: Appraisal): AppraisalModel {
  const checklist = checklistFor(a);
  const answers = a.validity[checklist.id] ?? {};
  const blocks: AppraisalBlock[] = [];
  const noNotes: string[] = [];
  const unclearNotes: string[] = [];
  let position = 0;

  const addBlock = (title_: string, lead: string[], items: readonly ChecklistItem[]): void => {
    const rows: AppraisalRow[] = [];
    for (const item of items) {
      position += 1;
      const answer = answers[item.id];
      const verdict: Verdict | null = answer?.verdict ?? null;
      const source = answer?.source ?? null;
      const override = source !== null && source !== a.sourceScope ? source : null;
      rows.push({ position, question: item.question, verdict: verdictCell(verdict, override) });

      // Only No and Unclear reach the notes: those are the items the group is
      // there to argue about. An unanswered item is a gap, not a finding, so its
      // note stays in the panel.
      if (verdict !== 'no' && verdict !== 'unclear') continue;
      const pieces: string[] = [];
      const note = oneLine(answer?.note ?? '');
      if (note !== '') pieces.push(endWithPeriod(note));
      // An Unclear on a question this source was never going to answer is not a
      // judgement at all, so the export names the document that would settle it.
      if (verdict === 'unclear' && needsMoreThan(item, source ?? a.sourceScope)) {
        pieces.push(EVIDENCE_NEED_HINTS[item.needs]);
      }
      if (pieces.length === 0) pieces.push(NO_NOTE);
      const line = `Item ${position}: ${pieces.join(' ')}`;
      (verdict === 'no' ? noNotes : unclearNotes).push(line);
    }
    blocks.push({ title: title_, lead, rows });
  };

  addBlock(SECTION_LABELS['internal-validity'], [], itemsInSection(checklist, 'internal-validity'));
  // `getChecklist` has already dropped the groups that do not apply to this
  // subtype, so whatever survives here belongs in the export.
  for (const group of checklist.groups ?? []) {
    addBlock(group.title, groupLead(group), group.items);
  }
  addBlock(
    SECTION_LABELS.applicability,
    [APPLICABILITY_IS_NOT_VALIDITY],
    itemsInSection(checklist, 'applicability'),
  );

  return {
    sourceLines: [appraisedFromLine(a.sourceScope), UNCLEAR_IS_A_LIMIT],
    blocks,
    funding: fundingRows(checklist, a),
    noNotes: noNotes.length === 0 ? [NOTHING_FLAGGED] : noNotes,
    unclearNotes: unclearNotes.length === 0 ? [NOTHING_FLAGGED] : unclearNotes,
  };
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

function markdownBullets(lines: readonly string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

/** The `## Critical appraisal` section, heading to last note. */
function markdownAppraisal(model: AppraisalModel): string[][] {
  const blocks: string[][] = [[`## ${APPRAISAL_HEADING}`]];
  // One paragraph per sentence: a soft break inside a paragraph is not a line
  // break in Markdown, and these two must not run together.
  for (const line of model.sourceLines) blocks.push([line]);

  for (const block of model.blocks) {
    blocks.push([`### ${block.title}`]);
    for (const line of block.lead) blocks.push([line]);
    blocks.push(
      block.rows.length === 0
        ? [NO_ITEMS]
        : markdownTable(
            ['#', 'Item', 'Verdict'],
            block.rows.map((row) => [String(row.position), row.question, row.verdict]),
          ),
    );
  }

  blocks.push([`### ${FUNDING_HEADING}`]);
  blocks.push([FUNDING_IS_NOT_SCORED]);
  blocks.push(markdownRows(model.funding));

  blocks.push([`### ${NOTES_HEADING}`]);
  blocks.push([NOTES_NO_HEADING]);
  blocks.push(markdownBullets(model.noNotes));
  blocks.push([NOTES_UNCLEAR_HEADING]);
  blocks.push(markdownBullets(model.unclearNotes));
  return blocks;
}

/**
 * Markdown export: the eight sections of spec §4.5 in order, blank ones
 * included, disclaimer last.
 */
export function buildSummaryMarkdown(a: Appraisal, opts: SummaryOptions): string {
  const subtype = subtypeLine(a);
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
    ...(subtype === null ? [] : [[subtype]]),
    [detectionLine(a)],

    ['## Key results'],
    markdownRows(keyResultRows(a.numbers)),
  ];

  const notes = numberNotes(a);
  if (notes.length > 0) {
    blocks.push([NUMBER_NOTES_HEADING]);
    blocks.push(markdownBullets(notes));
  }

  blocks.push(...markdownAppraisal(appraisalModel(a)));

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

/** The plain-text twin of `markdownAppraisal`: same content, no syntax. */
function textAppraisal(model: AppraisalModel): string[] {
  const lines: string[] = [...model.sourceLines, ''];

  // Numbered questions line up under each other whatever the item count, and the
  // verdict lines up under the question text rather than under its number.
  const width = String(
    model.blocks.reduce((last, block) => block.rows.at(-1)?.position ?? last, 0),
  ).length;

  for (const block of model.blocks) {
    lines.push(block.title);
    const body: string[] = [...block.lead];
    if (block.rows.length === 0) body.push(NO_ITEMS);
    for (const row of block.rows) {
      const number = `${String(row.position).padStart(width)}. `;
      body.push(`${number}${oneLine(row.question)}`);
      body.push(`${' '.repeat(number.length)}Verdict: ${row.verdict}`);
    }
    lines.push(...indent(body), '');
  }

  lines.push(FUNDING_HEADING);
  lines.push(...indent([FUNDING_IS_NOT_SCORED, ...alignedRows(model.funding)]), '');

  lines.push(NOTES_HEADING);
  lines.push(
    ...indent([
      NOTES_NO_HEADING,
      ...indent(model.noNotes),
      NOTES_UNCLEAR_HEADING,
      ...indent(model.unclearNotes),
    ]),
  );
  return lines;
}

/**
 * Plain-text export: identical content and order to the Markdown one, with no
 * Markdown syntax anywhere — indentation and `Label: value` lines instead of
 * headings, tables and emphasis, for an email or a chat window that would show
 * the punctuation raw.
 */
export function buildSummaryText(a: Appraisal, opts: SummaryOptions): string {
  const lines: string[] = [title(a), citationLine(a.citation, a.pmid, plainLink), ''];

  lines.push(
    ...textSection(
      'CLINICAL QUESTION (PICO)',
      alignedRows(picoRows(a).map((row) => ({ label: row.label, value: cell(row.value) }))),
    ),
  );
  lines.push('');

  const subtype = subtypeLine(a);
  lines.push(
    ...textSection('STUDY DESIGN', [
      designHeadline(a),
      ...(subtype === null ? [] : [subtype]),
      detectionLine(a),
    ]),
  );
  lines.push('');

  const keyResults = alignedRows(keyResultRows(a.numbers));
  const notes = numberNotes(a);
  if (notes.length > 0) keyResults.push(NUMBER_NOTES_HEADING, ...indent(notes));
  lines.push(...textSection('KEY RESULTS', keyResults));
  lines.push('');

  lines.push(...textSection(APPRAISAL_HEADING.toUpperCase(), textAppraisal(appraisalModel(a))));
  lines.push('');

  const bottomLine = a.bottomLine.trim();
  lines.push(...textSection('BOTTOM LINE', bottomLine === '' ? [] : bottomLine.split('\n')));
  lines.push('');

  lines.push(...textSection('DISCUSSION QUESTIONS', discussionLines(a)));
  lines.push('');

  lines.push(disclaimer(opts));
  return `${lines.join('\n')}\n`;
}
