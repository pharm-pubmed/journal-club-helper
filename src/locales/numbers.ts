/**
 * Sentences the arithmetic modules write in English, put into the reader's
 * language at the moment they are shown (#82).
 *
 * The English text is what is stored: `NumbersState.warnings` is saved with
 * each appraisal, and the summary prints it. So the stored text stays as it
 * is, and the panel matches it against the sentences those modules can write.
 * Anything it does not recognise is shown unchanged rather than dropped.
 */
import { CASE_CONTROL_CAVEAT, CROSS_SECTIONAL_CAVEAT } from '../lib/design-caveats';
import {
  BASELINE_RISK_WARNING_PREFIX,
  BASELINE_RISK_WARNING_SUFFIX,
  HAZARD_RATIO_WARNING,
  ODDS_RATIO_WARNING,
  formatNnt,
} from '../lib/effect-measures';
import type { EffectMeasures } from '../lib/types';
import type { Messages } from './en';

export function localizeWarning(warning: string, m: Messages): string {
  if (warning === ODDS_RATIO_WARNING) return m.numbers.oddsRatioWarning;
  if (warning === HAZARD_RATIO_WARNING) return m.numbers.hazardRatioWarning;
  if (
    warning.startsWith(BASELINE_RISK_WARNING_PREFIX) &&
    warning.endsWith(BASELINE_RISK_WARNING_SUFFIX)
  ) {
    const acr = warning.slice(
      BASELINE_RISK_WARNING_PREFIX.length,
      warning.length - BASELINE_RISK_WARNING_SUFFIX.length,
    );
    return m.numbers.baselineWarning(acr);
  }
  return warning;
}

export function localizeCaveat(caveat: string, m: Messages): string {
  if (caveat === CASE_CONTROL_CAVEAT) return m.numbers.caseControlCaveat;
  if (caveat === CROSS_SECTIONAL_CAVEAT) return m.numbers.crossSectionalCaveat;
  return caveat;
}

/** `formatNnt` with its English words, "No difference" and "to", in the reader's language. */
export function localizedNnt(result: EffectMeasures, m: Messages): string {
  const text = formatNnt(result);
  const match = /^No difference \(ARR (.+)\)$/.exec(text);
  if (match?.[1] !== undefined) return m.numbers.noDifference(match[1]);
  // "NNT 12 (95% CI 8–25)", or one crossing infinity: "NNT 12 (95% CI NNTB 5 to ∞ to
  // NNTH 30)", "NNT 25 (95% CI NNTB 14 to ∞)", "NNH 9 (95% CI ∞ to NNTH 8)".
  const withCi = /^(NN[TH] \d+) \(95% CI (.+)\)$/.exec(text);
  if (withCi?.[1] === undefined || withCi[2] === undefined) return text;
  return m.numbers.nntWithCi(withCi[1], withCi[2].split(' to ').join(m.numbers.rangeTo));
}
