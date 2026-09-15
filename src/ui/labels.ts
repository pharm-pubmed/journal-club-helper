/** Human-readable names for the UI and the export (issues #8, #15, #19). */
import type { DesignConfidence, StudyDesign, Verdict } from '../lib/types';

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
