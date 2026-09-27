import { describe, expect, it } from 'vitest';
import { candidatesCaveat, resultCaveat } from '../../src/lib/design-caveats';
import { STUDY_DESIGNS, type CalculatorMode, type StudyDesign } from '../../src/lib/types';

/**
 * The wording is written out in full here on purpose (issue #58): a reworded
 * caveat has to be re-read and re-approved in this file, not slip through
 * because a test only checked that some string came back.
 */
const CASE_CONTROL =
  'A case-control study samples on the outcome, so the proportions exposed among cases and ' +
  'among controls are not risks, and an ARR, NNT or NNH cannot be read from them. The route ' +
  'that holds is the odds ratio the study reports, applied to a baseline risk you choose.';

const CROSS_SECTIONAL =
  'A cross-sectional study measures prevalence at one point in time, so these proportions are ' +
  'prevalences, not risks. The difference between them is a difference in prevalence, and an ' +
  'NNT or NNH read from it does not count events caused or prevented.';

const MODES: readonly CalculatorMode[] = ['rates', 'counts', 'ratio'];

/** Every design and mode, spelled out, so adding a design forces a decision here. */
const EXPECTED_RESULT: Record<StudyDesign, Record<CalculatorMode, string | null>> = {
  rct: { rates: null, counts: null, ratio: null },
  'non-randomized-trial': { rates: null, counts: null, ratio: null },
  cohort: { rates: null, counts: null, ratio: null },
  'case-control': { rates: CASE_CONTROL, counts: CASE_CONTROL, ratio: null },
  'cross-sectional': { rates: CROSS_SECTIONAL, counts: CROSS_SECTIONAL, ratio: null },
  'sr-ma': { rates: null, counts: null, ratio: null },
  diagnostic: { rates: null, counts: null, ratio: null },
  unclear: { rates: null, counts: null, ratio: null },
};

describe('resultCaveat', () => {
  for (const design of STUDY_DESIGNS) {
    for (const mode of MODES) {
      const expected = EXPECTED_RESULT[design][mode];
      it(`${design} in ${mode} mode: ${expected === null ? 'no caveat' : 'caveat'}`, () => {
        expect(resultCaveat(design, mode)).toBe(expected);
      });
    }
  }

  it('points a case-control reader at the odds ratio, the one measure the sampling leaves intact', () => {
    expect(resultCaveat('case-control', 'counts')).toContain('odds ratio');
    // Tool-neutral: the same sentence goes into the export, read by people who never saw the panel.
    expect(resultCaveat('case-control', 'counts')).not.toContain('Ratio mode');
  });

  it('words the cross-sectional note differently, and more mildly, than the case-control one', () => {
    const crossSectional = resultCaveat('cross-sectional', 'rates') ?? '';

    expect(crossSectional).not.toBe(CASE_CONTROL);
    // The arithmetic on prevalences is sound, so the note must not say it cannot be done.
    expect(crossSectional).not.toContain('cannot be read');
    expect(crossSectional).toContain('prevalence');
  });
});

describe('candidatesCaveat', () => {
  for (const design of STUDY_DESIGNS) {
    const expected = design === 'case-control' ? CASE_CONTROL : null;
    it(`${design}: ${expected === null ? 'no note' : 'the case-control note'}`, () => {
      expect(candidatesCaveat(design)).toBe(expected);
    });
  }

  it('uses the same words above the candidates as beside a result', () => {
    expect(candidatesCaveat('case-control')).toBe(resultCaveat('case-control', 'counts'));
  });
});
