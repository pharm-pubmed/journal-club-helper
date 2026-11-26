/**
 * The Numbers tab shows sentences the arithmetic modules write in English, and
 * the stored appraisal keeps them in English (#82). These tests run the real
 * modules, so a change of wording there that the mapping does not follow shows
 * up here rather than as an English sentence in the Japanese panel.
 */
import { describe, expect, it } from 'vitest';
import { candidatesCaveat, resultCaveat } from '../../src/lib/design-caveats';
import { fromCounts, fromRates, fromRatio } from '../../src/lib/effect-measures';
import { en } from '../../src/locales/en';
import { ja } from '../../src/locales/ja';
import { localizeCaveat, localizeWarning, localizedNnt } from '../../src/locales/numbers';

describe('the Numbers tab in Japanese', () => {
  it('translates every warning a ratio conversion writes', () => {
    const warnings = [
      ...fromRatio('OR', 3.49, 0.01).warnings,
      ...fromRatio('HR', 0.89, 0.2).warnings,
      ...fromRatio('RR', 0.83, 0.298).warnings,
    ];
    expect(warnings.length).toBeGreaterThanOrEqual(5);
    for (const warning of warnings) {
      expect(localizeWarning(warning, ja), warning).not.toBe(warning);
      expect(localizeWarning(warning, en)).toBe(warning);
    }
    expect(localizeWarning(fromRatio('RR', 0.83, 0.298).warnings[0]!, ja)).toContain('29.8%');
  });

  it('translates both design caveats, and leaves English alone', () => {
    const caveats = [
      candidatesCaveat('case-control'),
      resultCaveat('case-control', 'counts'),
      resultCaveat('cross-sectional', 'rates'),
    ];
    for (const caveat of caveats) {
      expect(caveat).not.toBeNull();
      expect(localizeCaveat(caveat!, ja)).not.toBe(caveat);
      expect(localizeCaveat(caveat!, en)).toBe(caveat);
    }
  });

  it('shows an unknown sentence unchanged rather than dropping it', () => {
    expect(localizeWarning('Something new', ja)).toBe('Something new');
    expect(localizeCaveat('Something new', ja)).toBe('Something new');
  });

  it('says "no difference" in the reader’s language and leaves NNT text as it is', () => {
    expect(localizedNnt(fromRates(0.2, 0.2), ja)).toBe('差なし（ARR 0.0%）');
    expect(localizedNnt(fromRates(0.2, 0.2), en)).toBe('No difference (ARR 0.0%)');
    expect(localizedNnt(fromRates(0.773, 0.674), ja)).toBe('NNT 11');
    const crossing = fromCounts(10, 100, 11, 100);
    expect(localizedNnt(crossing, ja)).toBe('NNH 100 (95% CI NNTB 14〜∞〜NNTH 11)');
    expect(localizedNnt(crossing, en)).toBe('NNH 100 (95% CI NNTB 14 to ∞ to NNTH 11)');
  });
});
