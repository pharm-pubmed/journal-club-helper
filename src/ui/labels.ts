/** Human-readable names for the UI and the export (issues #8, #15, #19). */
import type {
  ChecklistSection,
  DesignConfidence,
  EvidenceNeed,
  SourceScope,
  StudyDesign,
  Verdict,
} from '../lib/types';

export const DESIGN_LABELS: Record<StudyDesign, string> = {
  rct: 'Randomized controlled trial',
  'non-randomized-trial': 'Non-randomized trial',
  cohort: 'Cohort study',
  'case-control': 'Case-control study',
  'cross-sectional': 'Cross-sectional study',
  'sr-ma': 'Systematic review / meta-analysis',
  diagnostic: 'Diagnostic accuracy study',
  unclear: 'Not detected',
};

/**
 * Labels for the design override <select> (issue #8). Identical to DESIGN_LABELS
 * except for `unclear`: "Not detected" describes what the classifier did and
 * reads wrong as something the user deliberately picks.
 */
export const DESIGN_OPTION_LABELS: Record<StudyDesign, string> = {
  ...DESIGN_LABELS,
  unclear: 'Unclear / other',
};

export const SUBTYPE_LABELS: Record<string, string> = {
  parallel: 'parallel',
  crossover: 'crossover',
  cluster: 'cluster',
  'non-inferiority': 'non-inferiority',
  'systematic-review': 'systematic review',
  'meta-analysis': 'meta-analysis',
  'network-meta-analysis': 'network meta-analysis',
};

export const CONFIDENCE_LABELS: Record<DesignConfidence, string> = {
  high: 'Detected from publication type',
  medium: 'Detected from abstract keywords',
  low: 'Not detected',
};

/** A second line under the design name, not a separate design (issue #10 of the rework). */
export const SUBTYPE_DESIGN_LINES: Record<string, string> = {
  'non-inferiority': 'Non-inferiority design',
  equivalence: 'Equivalence design',
  crossover: 'Crossover design',
  cluster: 'Cluster-randomised design',
  parallel: 'Parallel-group design',
  'systematic-review': 'Systematic review',
  'meta-analysis': 'Meta-analysis',
  'network-meta-analysis': 'Network meta-analysis',
};

export const SECTION_LABELS: Record<ChecklistSection, string> = {
  'internal-validity': 'Internal validity',
  applicability: 'Applicability',
};

export const SOURCE_SCOPE_LABELS: Record<SourceScope, string> = {
  abstract: 'Abstract only',
  'full-text': 'Full text',
  supplement: 'Supplement',
  protocol: 'Protocol',
  registry: 'Trial registry',
  other: 'Other source',
};

export const SOURCE_SCOPE_ORDER: readonly SourceScope[] = [
  'abstract',
  'full-text',
  'supplement',
  'protocol',
  'registry',
  'other',
] as const;

/**
 * Shown when the reader has less than a question needs. It explains an Unclear
 * instead of letting it read as a criticism of the study: an abstract's word
 * limit is not a methodological failure.
 */
export const EVIDENCE_NEED_HINTS: Record<EvidenceNeed, string> = {
  abstract: 'Usually answerable from the abstract.',
  'full-text': 'Usually needs the full text — an abstract rarely has this detail.',
  'protocol-or-registry':
    'Usually needs the protocol, the statistical analysis plan or the trial registry.',
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  yes: 'Yes',
  no: 'No',
  unclear: 'Unclear',
};

export const PICO_LABELS = {
  P: 'Population',
  I: 'Intervention',
  C: 'Comparison',
  O: 'Outcome',
} as const;

/** "Randomized controlled trial (parallel)" */
export function designLabel(design: StudyDesign, subtype: string | null): string {
  const base = DESIGN_LABELS[design];
  if (!subtype) return base;
  return `${base} (${SUBTYPE_LABELS[subtype] ?? subtype})`;
}

/** Fixed by spec §4.5: this is always the last line of an export. */
export const DISCLAIMER =
  'Generated with Journal Club Helper for educational purposes. Verify against the full text.';

export const PRODUCT_NAME = 'Journal Club Helper';
