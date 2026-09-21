/**
 * The study design the rest of the panel keys off (issue #8, spec §3-3).
 *
 * Detection is only ever a suggestion: `designOverride` wins, and the checklist
 * (#15) and the export (#19) read `design` from here so all three agree on one
 * answer. The subtype rides alongside the design rather than inside it — a
 * non-inferiority trial is still a randomised controlled trial — and it has its
 * own override, because the extra checks it switches on are otherwise
 * unreachable when the classifier misses the wording.
 *
 * Nothing in this module classifies on render — `runClassification` is called
 * once by the integration layer when an article binds, so re-rendering the
 * header can never change what was detected.
 */
import { useCallback } from 'preact/hooks';
import { classifyDesign } from '../../lib/design-classifier';
import type { DesignClassification, PubMedArticle, StudyDesign } from '../../lib/types';
import { actions, effectiveDesign, effectiveSubtype, useStore } from '../store';

export interface UseDesign {
  /** What the rules found, or null before `runClassification` has run. */
  classification: DesignClassification | null;
  /** The user's manual choice, or null while the detection stands. */
  override: StudyDesign | null;
  /** override ?? classification.design ?? 'unclear'. */
  design: StudyDesign;
  /**
   * The subtype in force (`effectiveSubtype`): the manual one if there is one,
   * otherwise the detected one while the detected design is still in force.
   * The empty string is a reader's explicit "this study has no subtype", which
   * reads as "no subtype" everywhere a subtype is matched but is not the same
   * as `null` — `null` here means nothing is in force at all.
   */
  subtype: string | null;
  /** What the classifier found, in force or not; the header cites it as the suggestion. */
  detectedSubtype: string | null;
  /** The user's manual subtype, or null while the detection stands. */
  subtypeOverride: string | null;
  isOverridden: boolean;
  isSubtypeOverridden: boolean;
  setOverride: (design: StudyDesign) => void;
  /** null drops the override; any string (including '') is a deliberate choice. */
  setSubtype: (subtype: string | null) => void;
  /** Drop the override and fall back to the detection. Clears the subtype override too. */
  reset: () => void;
  /** Drop only the subtype override, leaving a chosen design alone. */
  resetSubtype: () => void;
}

export function useDesign(): UseDesign {
  const classification = useStore((s) => s.classification);
  const override = useStore((s) => s.designOverride);
  const subtypeOverride = useStore((s) => s.subtypeOverride);
  const design = useStore(effectiveDesign);
  const subtype = useStore(effectiveSubtype);

  const setOverride = useCallback((next: StudyDesign): void => {
    actions.setDesignOverride(next);
  }, []);

  const setSubtype = useCallback((next: string | null): void => {
    actions.setSubtypeOverride(next);
  }, []);

  const reset = useCallback((): void => {
    // Clears the subtype override as well: a subtype belongs to a detection.
    actions.setDesignOverride(null);
  }, []);

  const resetSubtype = useCallback((): void => {
    actions.setSubtypeOverride(null);
  }, []);

  return {
    classification,
    override,
    design,
    subtype,
    detectedSubtype: classification?.subtype ?? null,
    subtypeOverride,
    isOverridden: override !== null,
    isSubtypeOverridden: subtypeOverride !== null,
    setOverride,
    setSubtype,
    reset,
    resetSubtype,
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
