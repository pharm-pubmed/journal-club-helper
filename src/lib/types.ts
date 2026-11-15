/**
 * Shared domain types (issue #2).
 *
 * Every type that crosses a module boundary is declared here once, and the
 * module that owns the behaviour re-exports it. That means `design-classifier.ts`
 * and `storage.ts` can be written at the same time without importing each other,
 * while consumers can still write the import path the issues document:
 *
 *   import type { DesignClassification } from './design-classifier';  // re-export
 *   import type { DesignClassification } from './types';              // same type
 *
 * Nothing in this file may import `chrome.*` or touch the DOM.
 */

import type { LocalePreference } from './i18n';

/* ------------------------------------------------------------------ article */

export type StudyDesign =
  | 'rct'
  | 'non-randomized-trial'
  | 'cohort'
  | 'case-control'
  | 'cross-sectional'
  | 'sr-ma'
  | 'diagnostic'
  | 'unclear';

export const STUDY_DESIGNS: readonly StudyDesign[] = [
  'rct',
  'non-randomized-trial',
  'cohort',
  'case-control',
  'cross-sectional',
  'sr-ma',
  'diagnostic',
  'unclear',
] as const;

export interface AbstractSection {
  label: string;
  text: string;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  /** Plain text; sections joined with "\n\n". */
  abstract: string;
  /** Empty array when the abstract is unstructured. */
  abstractSections: AbstractSection[];
  publicationTypes: string[];
  meshTerms: string[];
  authors: string[];
  journal: string;
  year: string;
  doi: string | null;
  source: 'dom' | 'eutils';
}

/* --------------------------------------------------------- design detection */

export type DesignConfidence = 'high' | 'medium' | 'low';

export interface DesignEvidence {
  kind: 'publication-type' | 'keyword';
  value: string;
}

export interface DesignClassification {
  design: StudyDesign;
  /**
   * rct: 'parallel' | 'crossover' | 'cluster' | 'non-inferiority'
   * sr-ma: 'systematic-review' | 'meta-analysis' | 'network-meta-analysis'
   */
  subtype: string | null;
  /** high = publication type, medium = keyword, low = unclear. */
  confidence: DesignConfidence;
  evidence: DesignEvidence[];
}

/* -------------------------------------------------------- number extraction */

export interface Span {
  raw: string;
  start: number;
  end: number;
  sentence: string;
}

export type RatioMeasure = 'RR' | 'HR' | 'OR';

export type PercentPairCandidate = Span & {
  kind: 'percent-pair';
  first: number;
  second: number;
  connector: 'vs' | 'versus' | 'and' | 'compared with';
};

export type FractionPairCandidate = Span & {
  kind: 'fraction-pair';
  aEvents: number;
  aTotal: number;
  bEvents: number;
  bTotal: number;
};

export type RatioCandidate = Span & {
  kind: 'ratio';
  measure: RatioMeasure;
  estimate: number;
  ciLow: number | null;
  ciHigh: number | null;
  pValue: string | null;
};

export type NumberCandidate = PercentPairCandidate | FractionPairCandidate | RatioCandidate;

/* ----------------------------------------------------------- effect measures */

export interface EffectCi {
  /** Wald bounds on the absolute risk reduction. */
  arrLow: number;
  arrHigh: number;
  nntLow: number | null;
  nntHigh: number | null;
  /** The ARR interval includes 0, so the NNT range passes through infinity. */
  crossesInfinity: boolean;
}

export interface EffectMeasures {
  cer: number;
  eer: number;
  /** cer − eer; > 0 benefit, < 0 harm. */
  arr: number;
  /** arr / cer. */
  rrr: number;
  /** ceil(1 / |arr|); null when arr === 0. */
  nnt: number | null;
  direction: 'benefit' | 'harm' | 'none';
  ci: EffectCi | null;
}

/* ---------------------------------------------------------------- checklists */

/**
 * Internal validity and applicability are different questions and are kept
 * apart: a trial can be flawlessly conducted and still not apply to your
 * patient, and the reverse. Funding is neither, so it is not an item at all —
 * see `InfoPanel`.
 */
export type ChecklistSection = 'internal-validity' | 'applicability';

/** Where an answer came from. Recorded per appraisal, overridable per item. */
export type SourceScope =
  'abstract' | 'full-text' | 'supplement' | 'protocol' | 'registry' | 'other';

/**
 * The weakest source that can usually answer a question.
 *
 * This is what stops the tool from punishing a paper for an abstract's word
 * limit: allocation concealment is almost never described in an abstract, so
 * when the reader has only the abstract the honest verdict is Unclear and the
 * UI says which document would settle it. Absence of reporting is not a
 * methodological failure.
 */
export type EvidenceNeed = 'abstract' | 'full-text' | 'protocol-or-registry';

export interface ChecklistItem {
  id: string;
  concept: string;
  section: ChecklistSection;
  /** A methodological question. It must not ask what the abstract happens to say. */
  question: string;
  why: string;
  /** Concrete things to look for, shown under the question. */
  lookFor: string[];
  needs: EvidenceNeed;
}

/** Items shown only for certain design subtypes, in addition to the main list. */
export interface ChecklistGroup {
  id: string;
  title: string;
  /** Matched against `DesignClassification.subtype`. */
  subtypes: string[];
  note?: string;
  items: ChecklistItem[];
}

/** Recorded as facts, never scored. Funding is the only one so far. */
export interface InfoField {
  id: string;
  label: string;
  hint?: string;
}

export interface InfoPanel {
  id: string;
  title: string;
  prompt: string;
  why: string;
  fields: InfoField[];
}

export interface Checklist {
  id: StudyDesign;
  title: string;
  version: number;
  note?: string;
  items: ChecklistItem[];
  groups?: ChecklistGroup[];
  info?: InfoPanel;
}

export type Verdict = 'yes' | 'no' | 'unclear';

export interface ItemAnswer {
  verdict: Verdict | null;
  /** What the paper says, and why that leads to the verdict. Kept short. */
  note: string;
  /** null inherits the appraisal's document-level `sourceScope`. */
  source: SourceScope | null;
}

export interface VerdictHelp {
  yes: string;
  no: string;
  unclear: string;
}

/* --------------------------------------------------------------------- PICO */

export type PicoField = 'P' | 'I' | 'C' | 'O';

export interface PicoCandidate {
  field: PicoField;
  text: string;
  start: number;
  end: number;
  reason: string;
}

export interface Pico {
  p: string;
  i: string;
  c: string;
  o: string;
}

/* ------------------------------------------------------- calculator / numbers */

export type CalculatorMode = 'rates' | 'counts' | 'ratio';

/** Raw field strings are stored so the calculator restores exactly what was typed. */
export interface RatesInputs {
  cerPercent: string;
  eerPercent: string;
}

export interface CountsInputs {
  controlEvents: string;
  controlTotal: string;
  interventionEvents: string;
  interventionTotal: string;
}

export interface RatioInputs {
  measure: RatioMeasure;
  estimate: string;
  ciLow: string;
  ciHigh: string;
  /** Assumed control event rate, in percent. */
  acrPercent: string;
}

export interface NumbersState {
  mode: CalculatorMode;
  inputs: {
    rates: RatesInputs;
    counts: CountsInputs;
    ratio: RatioInputs;
  };
  /** Only ever set by an explicit user action (spec §9). */
  result: EffectMeasures | null;
  warnings: string[];
  sourceCandidate: NumberCandidate | null;
}

/* ---------------------------------------------------------------- persistence */

export type CitationFields = Pick<PubMedArticle, 'title' | 'authors' | 'journal' | 'year' | 'doi'>;

/** validity[checklistId][itemId] — answers are kept per checklist so switching design never drops them. */
export type ValidityAnswers = Record<string, Record<string, ItemAnswer>>;

export interface Appraisal {
  schemaVersion: 2;
  pmid: string;
  createdAt: number;
  updatedAt: number;
  citation: CitationFields;
  designDetected: DesignClassification | null;
  designOverride: StudyDesign | null;
  /** Manual subtype, e.g. forcing the non-inferiority checks on when detection missed. */
  subtypeOverride: string | null;
  pico: Pico;
  numbers: NumbersState | null;
  validity: ValidityAnswers;
  /** Default for every item that does not override it. */
  sourceScope: SourceScope;
  /** Free-text facts recorded but never scored, keyed by `InfoField.id`. */
  info: Record<string, string>;
  bottomLine: string;
  /** Empty in v0.1; the AI features in v0.2 fill this. */
  discussionQuestions: string[];
}

export type CounterName = 'panelOpens' | 'exports' | 'aiRuns';

export interface Settings {
  schemaVersion: 1;
  counters: Record<CounterName, number>;
  /** The language the extension speaks; `auto` follows the browser (#82). */
  locale: LocalePreference;
}

/* ------------------------------------------------------------------ messaging */

export interface GetArticleMessage {
  type: 'GET_ARTICLE';
}

export interface OpenSidePanelMessage {
  type: 'OPEN_SIDE_PANEL';
}

/**
 * Sent by the options page after Delete all or an import, so an open side
 * panel drops the appraisal it holds in memory and reads storage again.
 */
export interface AppraisalsReplacedMessage {
  type: 'APPRAISALS_REPLACED';
}

export type ExtensionMessage = GetArticleMessage | OpenSidePanelMessage | AppraisalsReplacedMessage;

/** Reply to GET_ARTICLE. `article` is null when the page has no readable abstract. */
export interface GetArticleResponse {
  article: PubMedArticle | null;
}
