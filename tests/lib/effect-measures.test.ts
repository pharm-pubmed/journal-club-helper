import { describe, expect, it } from 'vitest';
import {
  formatNnt,
  fromCounts,
  fromRates,
  fromRatio,
  type EffectMeasures,
} from '../../src/lib/effect-measures';

/**
 * Every expectation below is either a spec example (§4.3), a textbook worked
 * example, or an arithmetic result written out by hand in a comment so that a
 * reviewer can re-check it without running the code.
 */

/** Builds a valid EffectMeasures literal so the formatter can be pinned in isolation. */
function shaped(patch: Partial<EffectMeasures> = {}): EffectMeasures {
  return {
    cer: 0.26,
    eer: 0.16,
    arr: 0.1,
    rrr: 0.385,
    nnt: 10,
    direction: 'benefit',
    ci: null,
    ...patch,
  };
}

describe('fromRates', () => {
  it('reproduces the spec example: CER 0.26 / EER 0.16 -> ARR 0.10, RRR 0.385, NNT 10', () => {
    // ARR = 0.26 - 0.16 = 0.10
    // RRR = 0.10 / 0.26 = 0.3846...
    // NNT = ceil(1 / 0.10) = 10
    const m = fromRates(0.26, 0.16);

    expect(m.cer).toBe(0.26);
    expect(m.eer).toBe(0.16);
    expect(m.arr).toBeCloseTo(0.1, 12);
    expect(m.rrr).toBeCloseTo(0.3846153846, 10);
    expect(m.nnt).toBe(10);
    expect(m.direction).toBe('benefit');
    expect(m.ci).toBeNull();
    expect(formatNnt(m)).toBe('NNT 10');
  });

  it('reports harm as NNH when the experimental group does worse', () => {
    // ARR = 0.10 - 0.174 = -0.074  ->  NNH = ceil(1 / 0.074) = ceil(13.51) = 14
    const m = fromRates(0.1, 0.174);

    expect(m.arr).toBeCloseTo(-0.074, 12);
    expect(m.direction).toBe('harm');
    expect(m.nnt).toBe(14);
    expect(m.rrr).toBeCloseTo(-0.74, 12);
    expect(formatNnt(m)).toBe('NNH 14');
  });

  it('returns nnt null and direction none when the ARR is exactly 0', () => {
    const m = fromRates(0.2, 0.2);

    expect(m.arr).toBe(0);
    expect(m.nnt).toBeNull();
    expect(m.direction).toBe('none');
    expect(m.rrr).toBe(0);
    expect(formatNnt(m)).toBe('No difference (ARR 0.0%)');
  });

  it('keeps RRR finite-free rather than NaN when the control event rate is 0', () => {
    // 0 events in the control arm: there is no baseline risk to reduce.
    expect(fromRates(0, 0).rrr).toBe(0);
    // Risk rose from a zero baseline: the relative increase has no finite value.
    expect(fromRates(0, 0.1).rrr).toBe(-Infinity);
  });

  it('accepts the boundary rates 0 and 1', () => {
    const m = fromRates(1, 0);
    expect(m.arr).toBe(1);
    expect(m.nnt).toBe(1);
    expect(m.rrr).toBe(1);
  });
});

describe('fromCounts', () => {
  it('computes the Wald interval for control 62/298 vs intervention 45/300', () => {
    // Hand computation (spec §4.3 example numbers):
    //   CER = 62/298 = 0.2080537        EER = 45/300 = 0.1500000
    //   ARR = 0.2080537 - 0.1500000     = 0.0580537
    //   RRR = 0.0580537 / 0.2080537     = 0.2790
    //   NNT = ceil(1 / 0.0580537) = ceil(17.2254) = 18
    //
    //   SE  = sqrt( CER(1-CER)/n_c + EER(1-EER)/n_i )
    //       = sqrt( 0.2080537 x 0.7919463 / 298 + 0.15 x 0.85 / 300 )
    //       = sqrt( 0.1647673 / 298              + 0.1275 / 300 )
    //       = sqrt( 0.00055291                   + 0.00042500 )
    //       = sqrt( 0.00097791 ) = 0.0312716
    //   1.96 x SE = 0.0612923
    //   ARR 95% CI = 0.0580537 -/+ 0.0612923 = (-0.0032386, +0.1193459)
    //
    //   The interval contains 0, so the NNT range passes through infinity:
    //     upper ARR bound 0.1193459 -> 1/0.1193459 = 8.38   -> NNTB 9
    //     lower ARR bound 0.0032386 -> 1/0.0032386 = 308.78 -> NNTH 309
    const m = fromCounts(62, 298, 45, 300);

    expect(m.cer).toBeCloseTo(0.2080537, 7);
    expect(m.eer).toBe(0.15);
    expect(m.arr).toBeCloseTo(0.058, 3);
    expect(m.arr).toBeCloseTo(0.0580537, 7);
    expect(m.rrr).toBeCloseTo(0.27903, 5);
    expect(m.nnt).toBe(18);
    expect(m.direction).toBe('benefit');

    const ci = m.ci;
    expect(ci).not.toBeNull();
    expect(ci?.arrLow).toBeCloseTo(-0.0032386, 6);
    expect(ci?.arrHigh).toBeCloseTo(0.1193459, 6);
    expect(ci?.crossesInfinity).toBe(true);
    expect(ci?.nntLow).toBe(9);
    expect(ci?.nntHigh).toBe(309);
    expect(formatNnt(m)).toBe('NNT 18 (95% CI NNTB 9 to ∞ to NNTH 309)');
  });

  it('orders the NNT bounds from the ARR bounds when the interval excludes 0', () => {
    // 111/370 = 0.30 vs 74/370 = 0.20.
    //   ARR = 0.10, NNT = 10
    //   SE  = sqrt(0.30 x 0.70/370 + 0.20 x 0.80/370) = sqrt(0.37/370) = sqrt(0.001) = 0.0316228
    //   1.96 x SE = 0.0619806
    //   ARR 95% CI = (0.0380194, 0.1619806)
    //     1/0.1619806 = 6.17  -> NNT 7   (bigger effect, fewer patients)
    //     1/0.0380194 = 26.30 -> NNT 27
    // This case also guards the reciprocal against IEEE-754 noise: 111/370 - 74/370 is
    // 0.09999999999999998, whose reciprocal 10.000000000000002 would naively ceil to 11.
    const m = fromCounts(111, 370, 74, 370);

    expect(m.nnt).toBe(10);
    expect(m.ci?.arrLow).toBeCloseTo(0.0380194, 6);
    expect(m.ci?.arrHigh).toBeCloseTo(0.1619806, 6);
    expect(m.ci?.crossesInfinity).toBe(false);
    expect(m.ci?.nntLow).toBe(7);
    expect(m.ci?.nntHigh).toBe(27);
    expect(formatNnt(m)).toBe('NNT 10 (95% CI 7–27)');
  });

  it('handles a harmful count comparison', () => {
    // Arms swapped: the intervention arm now carries the higher risk.
    const m = fromCounts(45, 300, 62, 298);

    expect(m.direction).toBe('harm');
    expect(m.arr).toBeCloseTo(-0.0580537, 7);
    expect(m.nnt).toBe(18);
    // Mirror image of the case above: the point estimate is harm, so the interval runs
    // from NNH 9 (real harm) out through infinity and back to NNTB 309 (trivial benefit).
    expect(m.ci?.nntLow).toBe(309);
    expect(m.ci?.nntHigh).toBe(9);
    expect(formatNnt(m)).toBe('NNH 18 (95% CI NNTB 309 to ∞ to NNTH 9)');
  });

  it('accepts zero events in both arms without producing NaN', () => {
    const m = fromCounts(0, 100, 0, 100);

    expect(m.arr).toBe(0);
    expect(m.nnt).toBeNull();
    expect(m.ci?.crossesInfinity).toBe(true);
    expect(m.ci?.nntLow).toBeNull();
    expect(m.ci?.nntHigh).toBeNull();
  });
});

describe('fromRatio: RR', () => {
  it('converts RR 0.72 at an assumed control rate of 0.20', () => {
    // EER = 0.20 x 0.72 = 0.144
    // ARR = 0.20 - 0.144 = 0.056  ->  NNT = ceil(1 / 0.056) = ceil(17.86) = 18
    // RRR = 0.056 / 0.20 = 0.28 = 1 - RR
    const m = fromRatio('RR', 0.72, 0.2);

    expect(m.cer).toBe(0.2);
    expect(m.eer).toBeCloseTo(0.144, 12);
    expect(m.arr).toBeCloseTo(0.056, 12);
    expect(m.rrr).toBeCloseTo(0.28, 12);
    expect(m.nnt).toBe(18);
    expect(m.direction).toBe('benefit');
    expect(m.ci).toBeNull();
  });

  it('transforms the RR confidence bounds into ARR and NNT bounds', () => {
    // RR 0.61 -> ARR = 0.20 x (1 - 0.61) = 0.078  -> 1/0.078 = 12.82 -> NNT 13
    // RR 0.85 -> ARR = 0.20 x (1 - 0.85) = 0.030  -> 1/0.030 = 33.33 -> NNT 34
    const m = fromRatio('RR', 0.72, 0.2, { low: 0.61, high: 0.85 });

    expect(m.ci?.arrLow).toBeCloseTo(0.03, 12);
    expect(m.ci?.arrHigh).toBeCloseTo(0.078, 12);
    expect(m.ci?.crossesInfinity).toBe(false);
    expect(m.ci?.nntLow).toBe(13);
    expect(m.ci?.nntHigh).toBe(34);
    expect(formatNnt(m)).toBe('NNT 18 (95% CI 13–34)');
  });

  it('flags a ratio interval that includes 1 as crossing infinity', () => {
    // RR 0.85 (95% CI 0.70 to 1.10) at ACR 0.20:
    //   point: ARR = 0.20 x 0.15 = 0.030 -> NNT 34
    //   0.70 -> ARR = +0.060 -> NNTB ceil(16.67) = 17
    //   1.10 -> ARR = -0.020 -> NNTH ceil(50.00) = 50
    const m = fromRatio('RR', 0.85, 0.2, { low: 0.7, high: 1.1 });

    expect(m.nnt).toBe(34);
    expect(m.ci?.crossesInfinity).toBe(true);
    expect(m.ci?.nntLow).toBe(17);
    expect(m.ci?.nntHigh).toBe(50);
    expect(formatNnt(m)).toBe('NNT 34 (95% CI NNTB 17 to ∞ to NNTH 50)');
  });

  it('drops the unreachable bound when a confidence limit is exactly 1', () => {
    // Upper limit RR 1.00 -> ARR bound exactly 0 -> the harm bound is infinite.
    const benefit = fromRatio('RR', 0.8, 0.2, { low: 0.5, high: 1 });
    expect(benefit.ci?.crossesInfinity).toBe(true);
    expect(benefit.ci?.nntLow).toBe(10);
    expect(benefit.ci?.nntHigh).toBeNull();
    expect(formatNnt(benefit)).toBe('NNT 25 (95% CI NNTB 10 to ∞)');

    // Lower limit RR 1.00 -> the benefit bound is the infinite one.
    const harm = fromRatio('RR', 1.2, 0.2, { low: 1, high: 1.5 });
    expect(harm.direction).toBe('harm');
    expect(harm.nnt).toBe(25);
    expect(harm.ci?.nntLow).toBeNull();
    expect(harm.ci?.nntHigh).toBe(10);
    expect(formatNnt(harm)).toBe('NNH 25 (95% CI ∞ to NNTH 10)');
  });

  it('tolerates confidence bounds given in the wrong order', () => {
    const forwards = fromRatio('RR', 0.72, 0.2, { low: 0.61, high: 0.85 });
    const backwards = fromRatio('RR', 0.72, 0.2, { low: 0.85, high: 0.61 });

    expect(backwards.ci).toEqual(forwards.ci);
  });

  it('warns that the absolute effect depends on the assumed control rate', () => {
    const m = fromRatio('RR', 0.72, 0.2);

    expect(m.warnings).toEqual([
      'This absolute effect is estimated from an assumed control event rate of 20.0%, so it only applies to patients whose untreated risk is close to that figure',
    ]);
  });
});

describe('fromRatio: OR', () => {
  it('converts OR 0.72 at an assumed control rate of 0.20', () => {
    // EER = OR x ACR / (1 - ACR + OR x ACR)
    //     = 0.72 x 0.20 / (1 - 0.20 + 0.72 x 0.20)
    //     = 0.144 / 0.944 = 0.1525424
    // ARR = 0.20 - 0.1525424 = 0.0474576 -> NNT = ceil(21.07) = 22
    const m = fromRatio('OR', 0.72, 0.2);

    expect(m.eer).toBeCloseTo(0.1525, 4);
    expect(m.eer).toBeCloseTo(0.15254237, 8);
    expect(m.arr).toBeCloseTo(0.04745763, 8);
    expect(m.nnt).toBe(22);
    expect(formatNnt(m)).toBe('NNT 22');
  });

  it('always attaches the odds-ratio overstatement warning', () => {
    const m = fromRatio('OR', 0.72, 0.2);

    expect(m.warnings).toContain(
      'Odds ratios overstate risk changes when the control event rate is high (above roughly 10–20 %)',
    );
    expect(m.warnings).toHaveLength(2);
  });

  it('transforms odds-ratio confidence bounds through the same conversion', () => {
    // 0.61 -> EER 0.1323210 -> ARR 0.0676790 -> NNT ceil(14.78) = 15
    // 0.85 -> EER 0.1752577 -> ARR 0.0247423 -> NNT ceil(40.42) = 41
    const m = fromRatio('OR', 0.72, 0.2, { low: 0.61, high: 0.85 });

    expect(m.ci?.arrLow).toBeCloseTo(0.0247423, 6);
    expect(m.ci?.arrHigh).toBeCloseTo(0.067679, 6);
    expect(m.ci?.nntLow).toBe(15);
    expect(m.ci?.nntHigh).toBe(41);
    expect(formatNnt(m)).toBe('NNT 22 (95% CI 15–41)');
  });

  it('never produces an event rate above 1, however large the odds ratio', () => {
    const m = fromRatio('OR', 500, 0.9);

    expect(m.eer).toBeLessThan(1);
    expect(m.direction).toBe('harm');
  });
});

describe('fromRatio: HR', () => {
  it('treats the hazard ratio as a risk ratio on the cumulative rate', () => {
    const hr = fromRatio('HR', 0.72, 0.2);
    const rr = fromRatio('RR', 0.72, 0.2);

    expect(hr.arr).toBe(rr.arr);
    expect(hr.nnt).toBe(18);
  });

  it('always attaches the hazard-ratio approximation warning', () => {
    const m = fromRatio('HR', 0.72, 0.2);

    expect(m.warnings).toContain(
      'A hazard ratio applied to a cumulative rate is an approximation; the time horizon must match the control event rate',
    );
    expect(m.warnings).toHaveLength(2);
  });

  it('formats a harmful hazard ratio with an interval as NNH', () => {
    // HR 1.5 at ACR 0.20 -> ARR = 0.20 x (1 - 1.5) = -0.10 -> NNH 10
    //   1.2 -> ARR -0.04 -> NNH 25
    //   2.0 -> ARR -0.20 -> NNH 5
    const m = fromRatio('HR', 1.5, 0.2, { low: 1.2, high: 2 });

    expect(m.direction).toBe('harm');
    expect(m.nnt).toBe(10);
    expect(m.ci?.crossesInfinity).toBe(false);
    expect(m.ci?.nntLow).toBe(5);
    expect(m.ci?.nntHigh).toBe(25);
    expect(formatNnt(m)).toBe('NNH 10 (95% CI 5–25)');
  });
});

describe('formatNnt output shapes', () => {
  it('matches the three shapes required by the issue', () => {
    expect(
      formatNnt(
        shaped({
          ci: { arrLow: 0.04, arrHigh: 0.1667, nntLow: 6, nntHigh: 25, crossesInfinity: false },
        }),
      ),
    ).toBe('NNT 10 (95% CI 6–25)');

    expect(formatNnt(shaped({ arr: -0.074, nnt: 14, direction: 'harm' }))).toBe('NNH 14');

    expect(
      formatNnt(
        shaped({
          nnt: 12,
          ci: { arrLow: -0.033, arrHigh: 0.2, nntLow: 5, nntHigh: 30, crossesInfinity: true },
        }),
      ),
    ).toBe('NNT 12 (95% CI NNTB 5 to ∞ to NNTH 30)');
  });

  it('falls back to the point estimate if a non-crossing bound is missing', () => {
    const m = shaped({
      ci: { arrLow: 0.1, arrHigh: 0.2, nntLow: null, nntHigh: 5, crossesInfinity: false },
    });

    expect(formatNnt(m)).toBe('NNT 10');
  });

  it('never leaks floating-point noise into the formatted string', () => {
    const outputs = [
      formatNnt(fromRates(0.26, 0.16)),
      formatNnt(fromRates(0.2, 0.2)),
      formatNnt(fromCounts(62, 298, 45, 300)),
      formatNnt(fromCounts(111, 370, 74, 370)),
      formatNnt(fromRatio('RR', 0.72, 0.2, { low: 0.61, high: 0.85 })),
      formatNnt(fromRatio('OR', 0.72, 0.2)),
      formatNnt(fromRatio('HR', 1.5, 0.2, { low: 1.2, high: 2 })),
    ];

    for (const out of outputs) {
      expect(out).not.toMatch(/\d{5,}/);
      expect(out).not.toMatch(/\.\d\d/);
      expect(out).toMatch(
        /^(NNT|NNH) \d+( \(95% CI (\d+–\d+|(NNTB \d+ to )?∞( to NNTH \d+)?)\))?$|^No difference \(ARR 0\.0%\)$/,
      );
    }
  });
});

describe('validation', () => {
  it('rejects a control event rate outside [0, 1]', () => {
    expect(() => fromRates(1.4, 0.2)).toThrow(RangeError);
    expect(() => fromRates(1.4, 0.2)).toThrow(/cer/);
    expect(() => fromRates(Number.NaN, 0.2)).toThrow(/cer/);
  });

  it('rejects an experimental event rate outside [0, 1]', () => {
    expect(() => fromRates(0.2, -0.1)).toThrow(RangeError);
    expect(() => fromRates(0.2, -0.1)).toThrow(/eer/);
  });

  it('rejects non-integer or negative counts', () => {
    expect(() => fromCounts(62.5, 298, 45, 300)).toThrow(/controlEvents/);
    expect(() => fromCounts(62, 298, -1, 300)).toThrow(/interventionEvents/);
  });

  it('rejects group totals below 1', () => {
    expect(() => fromCounts(0, 0, 45, 300)).toThrow(/controlTotal/);
    expect(() => fromCounts(62, 298, 45, 2.5)).toThrow(/interventionTotal/);
  });

  it('rejects more events than participants', () => {
    expect(() => fromCounts(299, 298, 45, 300)).toThrow(/controlEvents/);
    expect(() => fromCounts(62, 298, 301, 300)).toThrow(/interventionEvents/);
  });

  it('rejects a ratio that is not greater than 0', () => {
    expect(() => fromRatio('RR', 0, 0.2)).toThrow(RangeError);
    expect(() => fromRatio('RR', -0.5, 0.2)).toThrow(/estimate/);
  });

  it('rejects an assumed control rate outside (0, 1)', () => {
    expect(() => fromRatio('RR', 0.72, 0)).toThrow(/acr/);
    expect(() => fromRatio('RR', 0.72, 1)).toThrow(/acr/);
  });

  it('rejects confidence bounds that are not greater than 0', () => {
    expect(() => fromRatio('RR', 0.72, 0.2, { low: 0, high: 0.85 })).toThrow(/ci\.low/);
    expect(() => fromRatio('RR', 0.72, 0.2, { low: 0.61, high: -1 })).toThrow(/ci\.high/);
  });

  it('rejects a risk ratio that implies an event rate above 1', () => {
    // ACR 0.5 with RR 3 would mean 150 % of the experimental arm had the event.
    expect(() => fromRatio('RR', 3, 0.5)).toThrow(RangeError);
    expect(() => fromRatio('RR', 3, 0.5)).toThrow(/estimate/);
    expect(() => fromRatio('HR', 1.2, 0.5, { low: 1, high: 2.5 })).toThrow(/ci\.high/);
    // The boundary is allowed: an event rate of exactly 1 is possible.
    expect(fromRatio('RR', 2, 0.5).eer).toBe(1);
  });
});
