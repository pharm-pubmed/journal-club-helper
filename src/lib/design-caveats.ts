/**
 * What a study design does to the numbers the Numbers tab computes (issue #58).
 *
 * The calculator treats two proportions as event rates in a control and an
 * intervention group. That reading depends on how the study was sampled, and
 * for two designs it does not hold:
 *
 *   - A case-control study picks its participants by outcome. The pairs its
 *     abstract reports are the share of cases exposed and the share of controls
 *     exposed, and even the other direction (outcome among the exposed) is fixed
 *     by how many controls were chosen per case. Neither is a risk, so an ARR or
 *     an NNT computed from them has no meaning. The odds ratio survives that
 *     sampling, which is why Ratio mode, with a baseline risk the reader
 *     supplies, is the route that holds.
 *   - A cross-sectional study samples a population at one moment without regard
 *     to either exposure or outcome, so the arithmetic on its proportions is
 *     sound. What it measures is prevalence, though, not risk: the difference is
 *     a prevalence difference, and an NNT built on it counts no events caused or
 *     prevented. That is a milder problem, so it gets a milder note, shown only
 *     with a result. It is not shown above the candidates, because nothing is
 *     wrong with using them. It is not shown in Ratio mode either: there the
 *     baseline is the reader's own figure, and the baseline-risk warning from
 *     effect-measures.ts already says the result holds only near it.
 *
 * Trials and cohorts follow people forward from exposure, so their proportions
 * are risks and get no note. The remaining designs get none either, as a limit
 * of scope rather than a finding: a diagnostic accuracy study's proportions are
 * not event rates, but its wording was not decided in #58.
 *
 * Only informs. Nothing here removes a candidate or refuses a calculation:
 * whether a pair is usable is still the reader's call. The panel and the export
 * both take their wording from here, so the two cannot drift apart.
 *
 * Pure module: no chrome.*, no DOM.
 */
import type { CalculatorMode, StudyDesign } from './types';

export const CASE_CONTROL_CAVEAT =
  'A case-control study samples on the outcome, so the proportions exposed among cases and ' +
  'among controls are not risks, and an ARR, NNT or NNH cannot be read from them. The route ' +
  'that holds is the odds ratio the study reports, applied to a baseline risk you choose.';

export const CROSS_SECTIONAL_CAVEAT =
  'A cross-sectional study measures prevalence at one point in time, so these proportions are ' +
  'prevalences, not risks. The difference between them is a difference in prevalence, and an ' +
  'NNT or NNH read from it does not count events caused or prevented.';

/**
 * The note shown above the detected candidates, whatever mode the calculator
 * is in: the pairs listed there are the ones a reader is about to misuse.
 */
export function candidatesCaveat(design: StudyDesign): string | null {
  return design === 'case-control' ? CASE_CONTROL_CAVEAT : null;
}

/**
 * The note that travels with a result, beside it in the panel and under it in
 * the export. Rates and Counts read proportions straight off the study; Ratio
 * does not, so it never gets one.
 */
export function resultCaveat(design: StudyDesign, mode: CalculatorMode): string | null {
  if (mode === 'ratio') return null;
  switch (design) {
    case 'case-control':
      return CASE_CONTROL_CAVEAT;
    case 'cross-sectional':
      return CROSS_SECTIONAL_CAVEAT;
    default:
      return null;
  }
}
