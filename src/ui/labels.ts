/**
 * The English labels, for the export (issue #19), which is still English only.
 * The text itself lives in the catalogs (`src/locales`, #82); the panel reads
 * it through `useMessages()`.
 */
import type { SourceScope, StudyDesign } from '../lib/types';
import type { Messages } from '../locales';
import { en } from '../locales/en';

export const DESIGN_LABELS = en.labels.design;
/** As DESIGN_LABELS, but `unclear` reads as a choice rather than as a detection. */
export const DESIGN_OPTION_LABELS: Record<StudyDesign, string> = {
  ...en.labels.design,
  unclear: en.labels.designUnclearOption,
};
export const SUBTYPE_DESIGN_LINES = en.labels.subtypeLine;
export const CONFIDENCE_LABELS = en.labels.confidence;
export const SECTION_LABELS = en.labels.section;
export const SOURCE_SCOPE_LABELS = en.labels.sourceScope;
export const EVIDENCE_NEED_HINTS = en.labels.evidenceNeed;
export const VERDICT_LABELS = en.labels.verdict;
export const PICO_LABELS = en.labels.pico;

export const SOURCE_SCOPE_ORDER: readonly SourceScope[] = [
  'abstract',
  'full-text',
  'supplement',
  'protocol',
  'registry',
  'other',
] as const;

/** "Randomized controlled trial (parallel)" */
export function designLabel(design: StudyDesign, subtype: string | null, m: Messages): string {
  const base = m.labels.design[design];
  if (!subtype) return base;
  return m.labels.designWithSubtype(base, m.labels.subtype[subtype] ?? subtype);
}

/** A subtype nobody wrote a line for still has to read as a line, not vanish. */
export function subtypeLine(subtype: string, m: Messages): string {
  return m.labels.subtypeLine[subtype] ?? m.labels.subtypeLineFallback(subtype);
}

/** Fixed by spec §4.5: this is always the last line of an export. */
export const DISCLAIMER =
  'Generated with Journal Club Helper for educational purposes. Verify against the full text.';

export const PRODUCT_NAME = en.common.productName;
