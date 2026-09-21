/**
 * The study design the rest of the panel keys off (issue #8, spec §3-3).
 *
 * Detection is only ever a suggestion: `designOverride` wins, and the checklist
 * (#15) and the export (#19) read `design` from here so all three agree on one
 * answer. Nothing in this module classifies on render — `runClassification` is
 * called once by the integration layer when an article binds, so re-rendering
 * the header can never change what was detected.
 */
import { useCallback } from 'preact/hooks';
import { classifyDesign } from '../../lib/design-classifier';
import type { DesignClassification, PubMedArticle, StudyDesign } from '../../lib/types';
import { actions, effectiveDesign, useStore } from '../store';

export interface UseDesign {
  /** What the rules found, or null before `runClassification` has run. */
  classification: DesignClassification | null;
  /** The user's manual choice, or null while the detection stands. */
  override: StudyDesign | null;
  /** override ?? classification.design ?? 'unclear'. */
  design: StudyDesign;
  /** Only set while the effective design is still the detected one — a subtype belongs to a detection. */
  subtype: string | null;
  isOverridden: boolean;
  setOverride: (design: StudyDesign) => void;
  /** Drop the override and fall back to the detection. */
  reset: () => void;
}

export function useDesign(): UseDesign {
  const classification = useStore((s) => s.classification);
  const override = useStore((s) => s.designOverride);
  const design = useStore(effectiveDesign);

  const setOverride = useCallback((next: StudyDesign): void => {
    actions.setDesignOverride(next);
  }, []);

  const reset = useCallback((): void => {
    actions.setDesignOverride(null);
  }, []);

  return {
    classification,
    override,
    design,
    subtype: classification && classification.design === design ? classification.subtype : null,
    isOverridden: override !== null,
    setOverride,
    reset,
  };
}

/**
 * Classify a bound article and publish the result to the store.
 *
 * INTEGRATION: call this from the layer that binds the article (issue #6), once
 * per newly bound PMID — e.g. right after `actions.setArticle(article)`, or in
 * an effect keyed on the article object. It is pure and idempotent: re-running
 * it on the same article rewrites the same classification and never touches
 * `designOverride`, so a user's manual choice survives. Passing null clears the
 * classification, which is what unbinding an article should do.
 */
export function runClassification(article: PubMedArticle | null): DesignClassification | null {
  if (!article) {
    actions.setClassification(null);
    return null;
  }
  const classification = classifyDesign({
    publicationTypes: article.publicationTypes,
    abstract: article.abstract,
    title: article.title,
  });
  actions.setClassification(classification);
  return classification;
}
