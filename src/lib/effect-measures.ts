/**
 * Effect measures: ARR, RRR, NNT / NNH and their 95 % confidence intervals
 * (spec §4.3, issue #11).
 *
 * Pure module by design: no chrome.*, no DOM, no I/O. Everything the Numbers tab
 * displays is derived here so the arithmetic can be unit tested on its own, and
 * so a reviewer only has to check one file to trust the numbers a clinician will
 * quote out loud.
 *
 * Background reading for the methods used here (absolute effects, and converting
 * a ratio measure to an absolute risk difference at an assumed baseline risk):
 * Cochrane Handbook §12.5 and the CEBM Oxford NNT material. Every explanation in
 * this file is written in our own words.
 */

import type { EffectCi, EffectMeasures, RatioMeasure } from './types';

export type { EffectMeasures, EffectCi } from './types';

/** Normal deviate for a two-sided 95 % interval. */
const Z_95 = 1.96;

/**
 * Significant digits kept before a reciprocal is rounded up to a whole patient.
 * Binary floating point turns an exact ARR of 0.1 (for example 111/370 − 74/370)
 * into 0.09999999999999998, whose reciprocal 10.000000000000002 would otherwise
 * be rounded up to an NNT of 11. Twelve significant digits erase that noise while
 * leaving any difference a clinician could have entered intact.
 */
const RECIPROCAL_PRECISION = 12;

export const BASELINE_RISK_WARNING_PREFIX =
  'This absolute effect is estimated from an assumed control event rate of ';
export const BASELINE_RISK_WARNING_SUFFIX =
  ', so it only applies to patients whose untreated risk is close to that figure';

export const ODDS_RATIO_WARNING =
  'Odds ratios overstate risk changes when the control event rate is high (above roughly 10–20 %)';

export const HAZARD_RATIO_WARNING =
  'A hazard ratio applied to a cumulative rate is an approximation; the time horizon must match the control event rate';

/* ------------------------------------------------------------------ validation */

function assertRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a proportion between 0 and 1 (received ${value})`);
  }
}

function assertEventCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of events, 0 or more (received ${value})`);
  }
}

function assertGroupTotal(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `${name} must be a whole number of participants, 1 or more (received ${value})`,
    );
  }
}

function assertEventsFitGroup(
  events: number,
  total: number,
  eventsName: string,
  totalName: string,
): void {
  if (events > total) {
    throw new RangeError(`${eventsName} (${events}) cannot exceed ${totalName} (${total})`);
  }
}

function assertPositiveRatio(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a ratio greater than 0 (received ${value})`);
  }
}

function assertAssumedControlRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be a proportion above 0 and below 1 (received ${value})`);
  }
}

/* ----------------------------------------------------------------- arithmetic */

/** Rounds up to a whole patient after discarding binary-representation noise. */
function ceilPatients(value: number): number {
  return Math.ceil(Number(value.toPrecision(RECIPROCAL_PRECISION)));
}

/**
 * NNT (or NNH) for a risk difference. Null means "infinite": either the two arms
 * are identical, or this end of a confidence interval sits exactly on no effect.
 */
function nntFromArr(arr: number): number | null {
  if (arr === 0) return null;
  return ceilPatients(1 / Math.abs(arr));
}

/**
 * RRR is ARR / CER, which needs a baseline to divide by. With no events in the
 * control arm there is nothing to reduce, so an unchanged risk is reported as 0
 * and a risk that rose from zero is reported as an unbounded relative increase
 * rather than a silent NaN.
 */
function relativeRiskReduction(arr: number, cer: number): number {
  if (arr === 0) return 0;
  if (cer === 0) return -Infinity;
  return arr / cer;
}

function directionOf(arr: number): EffectMeasures['direction'] {
  if (arr > 0) return 'benefit';
  if (arr < 0) return 'harm';
  return 'none';
}

/**
 * Turns a pair of ARR bounds into the NNT interval.
 *
 * When both bounds sit on the same side of zero the NNT interval is simply the
 * reciprocals, smallest first: the larger risk difference needs fewer patients
 * treated. When the ARR interval contains zero the NNT interval is not an
 * interval at all — it runs from a number needed to treat, out through infinity
 * (no effect), and back to a number needed to harm. `nntLow` is then the benefit
 * end (NNTB, from the positive ARR bound) and `nntHigh` the harm end (NNTH, from
 * the negative ARR bound); a bound sitting exactly on zero is infinite and is
 * reported as null.
 */
function ciFromArrBounds(boundA: number, boundB: number): EffectCi {
  const arrLow = Math.min(boundA, boundB);
  const arrHigh = Math.max(boundA, boundB);

  if (arrLow <= 0 && arrHigh >= 0) {
    return {
      arrLow,
      arrHigh,
      nntLow: nntFromArr(arrHigh),
      nntHigh: nntFromArr(arrLow),
      crossesInfinity: true,
    };
  }

  const smallestEffect = Math.min(Math.abs(arrLow), Math.abs(arrHigh));
  const largestEffect = Math.max(Math.abs(arrLow), Math.abs(arrHigh));
  return {
    arrLow,
    arrHigh,
    nntLow: nntFromArr(largestEffect),
    nntHigh: nntFromArr(smallestEffect),
    crossesInfinity: false,
  };
}

function buildMeasures(cer: number, eer: number, ci: EffectCi | null): EffectMeasures {
  const arr = cer - eer;
  return {
    cer,
    eer,
    arr,
    rrr: relativeRiskReduction(arr, cer),
    nnt: nntFromArr(arr),
    direction: directionOf(arr),
    ci,
  };
}

/* -------------------------------------------------------------- public API */

/**
 * Point estimate from two event rates, as read straight off an abstract
 * ("12.3 % vs 8.1 %"). Percentages alone carry no group sizes, so there is no
 * confidence interval to report and `ci` is null.
 */
export function fromRates(cer: number, eer: number): EffectMeasures {
  assertRate(cer, 'cer');
  assertRate(eer, 'eer');
  return buildMeasures(cer, eer, null);
}

/**
 * Estimate and Wald 95 % interval from the four cell counts.
 *
 * SE(ARR) = sqrt( CER(1−CER)/n_control + EER(1−EER)/n_intervention ), and the
 * interval is ARR ± 1.96 · SE. The NNT bounds are the reciprocals of the ARR
 * bounds. The Wald interval is the one abstracts and bedside calculators use.
 * It is known to be optimistic for very small groups or very rare events, but
 * the method is kept fixed rather than swapped per input so that the interval
 * shown is always the one a reader can recompute by hand from the same counts.
 */
export function fromCounts(
  controlEvents: number,
  controlTotal: number,
  interventionEvents: number,
  interventionTotal: number,
): EffectMeasures {
  assertEventCount(controlEvents, 'controlEvents');
  assertGroupTotal(controlTotal, 'controlTotal');
  assertEventCount(interventionEvents, 'interventionEvents');
  assertGroupTotal(interventionTotal, 'interventionTotal');
  assertEventsFitGroup(controlEvents, controlTotal, 'controlEvents', 'controlTotal');
  assertEventsFitGroup(
    interventionEvents,
    interventionTotal,
    'interventionEvents',
    'interventionTotal',
  );

  const cer = controlEvents / controlTotal;
  const eer = interventionEvents / interventionTotal;
  const arr = cer - eer;
  const standardError = Math.sqrt(
    (cer * (1 - cer)) / controlTotal + (eer * (1 - eer)) / interventionTotal,
  );
  const halfWidth = Z_95 * standardError;

  return buildMeasures(cer, eer, ciFromArrBounds(arr - halfWidth, arr + halfWidth));
}

/**
 * Experimental event rate implied by a ratio measure at an assumed control rate.
 *
 * RR and HR multiply the baseline risk directly. OR has to be converted through
 * the odds: EER = OR·ACR / (1 − ACR + OR·ACR), which is why an odds ratio and a
 * risk ratio of the same size give different absolute effects.
 *
 * `argName` names whichever ratio is being converted so that an impossible
 * combination points at the field the user typed it into.
 */
function eerFromRatio(measure: RatioMeasure, ratio: number, acr: number, argName: string): number {
  if (measure === 'OR') {
    const experimentalOdds = ratio * acr;
    return experimentalOdds / (1 - acr + experimentalOdds);
  }

  const eer = acr * ratio;
  if (eer > 1) {
    throw new RangeError(
      `${argName} (${ratio}) implies an event rate above 100 % at a control event rate of ${acr}`,
    );
  }
  return eer;
}

/**
 * Absolute effect estimated from a relative one plus an assumed control event
 * rate (ACR) — the common case, because abstracts report RR, HR or OR and leave
 * the reader to supply the baseline risk.
 *
 * The result is only as good as that baseline: the same ratio produces a very
 * different NNT in a high-risk and a low-risk population, which is what the
 * first warning says. `ci` bounds, when given, go through exactly the same
 * conversion as the point estimate.
 */
export function fromRatio(
  measure: RatioMeasure,
  estimate: number,
  acr: number,
  ci?: { low: number; high: number },
): EffectMeasures & { warnings: string[] } {
  assertPositiveRatio(estimate, 'estimate');
  assertAssumedControlRate(acr, 'acr');

  const eer = eerFromRatio(measure, estimate, acr, 'estimate');

  let effectCi: EffectCi | null = null;
  if (ci !== undefined) {
    assertPositiveRatio(ci.low, 'ci.low');
    assertPositiveRatio(ci.high, 'ci.high');
    effectCi = ciFromArrBounds(
      acr - eerFromRatio(measure, ci.low, acr, 'ci.low'),
      acr - eerFromRatio(measure, ci.high, acr, 'ci.high'),
    );
  }

  const warnings = [
    `${BASELINE_RISK_WARNING_PREFIX}${formatPercent(acr)}${BASELINE_RISK_WARNING_SUFFIX}`,
  ];
  if (measure === 'OR') warnings.push(ODDS_RATIO_WARNING);
  if (measure === 'HR') warnings.push(HAZARD_RATIO_WARNING);

  return { ...buildMeasures(acr, eer, effectCi), warnings };
}

/* -------------------------------------------------------------- formatting */

/** One decimal place, so a rate never arrives on screen as 20.000000000000004 %. */
function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * One line a clinician can read out. Whole numbers only: a fractional patient
 * means nothing, and rounding up never promises more than the estimate supports.
 *
 * Shapes:
 *   NNT 10                                        (no interval available)
 *   NNT 10 (95% CI 6–25)                          (interval on one side of zero)
 *   NNH 14 (95% CI 5–25)                          (same, experimental arm worse)
 *   NNT 12 (95% CI NNTB 5 to ∞ to NNTH 30)        (interval includes no effect)
 *   No difference (ARR 0.0%)                      (identical event rates)
 *
 * The crossing form is spelled out rather than printed as a plain range because
 * "6 to 25" and "6 to ∞ to 25" mean opposite things: the second says the data are
 * also compatible with the treatment harming patients.
 */
export function formatNnt(m: EffectMeasures): string {
  if (m.nnt === null) return `No difference (ARR ${formatPercent(m.arr)})`;

  const label = m.direction === 'harm' ? 'NNH' : 'NNT';
  const ci = m.ci;
  if (ci === null) return `${label} ${m.nnt}`;

  if (ci.crossesInfinity) {
    const ends: string[] = [];
    if (ci.nntLow !== null) ends.push(`NNTB ${ci.nntLow}`);
    ends.push('∞');
    if (ci.nntHigh !== null) ends.push(`NNTH ${ci.nntHigh}`);
    return `${label} ${m.nnt} (95% CI ${ends.join(' to ')})`;
  }

  // Both bounds are finite here; the guard keeps the string honest if a caller
  // hands in a hand-built interval.
  if (ci.nntLow === null || ci.nntHigh === null) return `${label} ${m.nnt}`;
  return `${label} ${m.nnt} (95% CI ${ci.nntLow}–${ci.nntHigh})`;
}
