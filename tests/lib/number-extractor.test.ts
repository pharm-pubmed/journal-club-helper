import { describe, expect, it } from 'vitest';
import { extractNumberCandidates, type NumberCandidate } from '../../src/lib/number-extractor';

type PercentPair = Extract<NumberCandidate, { kind: 'percent-pair' }>;
type FractionPair = Extract<NumberCandidate, { kind: 'fraction-pair' }>;
type Ratio = Extract<NumberCandidate, { kind: 'ratio' }>;

function at(candidates: NumberCandidate[], index: number): NumberCandidate {
  const candidate = candidates[index];
  if (candidate === undefined) {
    throw new Error(`expected a candidate at index ${index}, got ${candidates.length} candidates`);
  }
  return candidate;
}

function percentPairAt(candidates: NumberCandidate[], index: number): PercentPair {
  const candidate = at(candidates, index);
  if (candidate.kind !== 'percent-pair') {
    throw new Error(`expected a percent-pair at index ${index}, got ${candidate.kind}`);
  }
  return candidate;
}

function fractionPairAt(candidates: NumberCandidate[], index: number): FractionPair {
  const candidate = at(candidates, index);
  if (candidate.kind !== 'fraction-pair') {
    throw new Error(`expected a fraction-pair at index ${index}, got ${candidate.kind}`);
  }
  return candidate;
}

function ratioAt(candidates: NumberCandidate[], index: number): Ratio {
  const candidate = at(candidates, index);
  if (candidate.kind !== 'ratio') {
    throw new Error(`expected a ratio at index ${index}, got ${candidate.kind}`);
  }
  return candidate;
}

/** Every candidate must point back at the exact substring it was built from. */
function expectExactOffsets(text: string, candidates: NumberCandidate[]): void {
  for (const candidate of candidates) {
    expect(text.slice(candidate.start, candidate.end)).toBe(candidate.raw);
    expect(candidate.sentence).toContain(candidate.raw);
  }
}

describe('extractNumberCandidates — percent pairs', () => {
  it('extracts "X% vs Y%" keeping document order', () => {
    const text =
      'The primary outcome occurred in 12.3% vs 8.1% of patients over 12 months of follow-up.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = percentPairAt(candidates, 0);
    expect(pair.first).toBe(12.3);
    expect(pair.second).toBe(8.1);
    expect(pair.connector).toBe('vs');
    expect(pair.raw).toBe('12.3% vs 8.1%');
    expectExactOffsets(text, candidates);
  });

  it('does not split the sentence on the abbreviation "vs."', () => {
    const text = 'Death from any cause occurred in 9.6% vs. 12.4% of participants.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = percentPairAt(candidates, 0);
    expect(pair.connector).toBe('vs');
    expect(pair.raw).toBe('9.6% vs. 12.4%');
    expect(pair.sentence).toBe('Death from any cause occurred in 9.6% vs. 12.4% of participants.');
    expectExactOffsets(text, candidates);
  });

  it('extracts "versus" pairs', () => {
    const text = 'Mortality at 28 days was 24% versus 31% in the usual-care arm.';
    const candidates = extractNumberCandidates(text);

    const pair = percentPairAt(candidates, 0);
    expect(pair.connector).toBe('versus');
    expect(pair.first).toBe(24);
    expect(pair.second).toBe(31);
    expectExactOffsets(text, candidates);
  });

  it('extracts "compared with" pairs', () => {
    const text =
      'The response rate was 45.2% compared with 38.7% in the standard-of-care group (P = 0.04).';
    const candidates = extractNumberCandidates(text);

    const pair = percentPairAt(candidates, 0);
    expect(pair.connector).toBe('compared with');
    expect(pair.first).toBe(45.2);
    expect(pair.second).toBe(38.7);
    expectExactOffsets(text, candidates);
  });

  it('accepts one-decimal percentages and an optional space before the percent sign', () => {
    const text = 'Event rates were 12.3 % vs 8.1 % over the study period.';
    const candidates = extractNumberCandidates(text);

    const pair = percentPairAt(candidates, 0);
    expect(pair.first).toBe(12.3);
    expect(pair.second).toBe(8.1);
    expect(pair.raw).toBe('12.3 % vs 8.1 %');
    expectExactOffsets(text, candidates);
  });

  it('accepts an "and" pair when the sentence carries an outcome cue', () => {
    const text =
      'The incidence of the primary endpoint was 5.0% and 9.4% in the two treatment groups.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = percentPairAt(candidates, 0);
    expect(pair.connector).toBe('and');
    expect(pair.first).toBe(5);
    expect(pair.second).toBe(9.4);
    expectExactOffsets(text, candidates);
  });

  it('rejects an "and" pair with no outcome cue in the sentence (false-positive guard)', () => {
    const text = 'Overall, 50% and 60% of patients agreed to take part in the survey.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });

  it('keeps a bare "and" pair out of a sentence that only mentions funding or demographics', () => {
    const text = 'Women made up 48% and 52% of the two cohorts at baseline.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });

  it('rejects percentages above 100, which are relative changes rather than event rates', () => {
    const text = 'Prescribing of the drug increased by 120% vs 45% over the decade.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });

  it('ranks vs / versus / compared with pairs above bare "and" pairs', () => {
    const text = [
      'Adherence rates were 70% and 65% in the two arms.',
      'Mortality was 10.0% vs 15.0% at one year.',
    ].join(' ');
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(2);
    expect(percentPairAt(candidates, 0).connector).toBe('vs');
    expect(percentPairAt(candidates, 1).connector).toBe('and');
    expectExactOffsets(text, candidates);
  });

  it('deduplicates overlapping percent matches, keeping the more specific connector', () => {
    const text = 'Event rates were 20.0% and 12.3% vs 8.1% across the study arms.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = percentPairAt(candidates, 0);
    expect(pair.connector).toBe('vs');
    expect(pair.raw).toBe('12.3% vs 8.1%');
    expectExactOffsets(text, candidates);
  });

  it('extracts two independent percent pairs from one sentence', () => {
    const text =
      'Mortality was 10.0% vs 15.0%, and the incidence of stroke was 2.0% vs 3.0% at 90 days.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(2);
    expect(percentPairAt(candidates, 0).raw).toBe('10.0% vs 15.0%');
    expect(percentPairAt(candidates, 1).raw).toBe('2.0% vs 3.0%');
    expectExactOffsets(text, candidates);
  });
});

describe('extractNumberCandidates — fraction pairs', () => {
  it('extracts "45/300 vs 62/298" in document order', () => {
    const text = 'The primary endpoint occurred in 45/300 vs 62/298 patients.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = fractionPairAt(candidates, 0);
    expect(pair.aEvents).toBe(45);
    expect(pair.aTotal).toBe(300);
    expect(pair.bEvents).toBe(62);
    expect(pair.bTotal).toBe(298);
    expect(pair.raw).toBe('45/300 vs 62/298');
    expectExactOffsets(text, candidates);
  });

  it('extracts a slash pair that carries an inline percentage', () => {
    const text = 'Recurrence was observed in 45/300 (15.0%) vs 62/298 (20.8%) participants.';
    const candidates = extractNumberCandidates(text);

    const pair = fractionPairAt(candidates, 0);
    expect(pair.aEvents).toBe(45);
    expect(pair.bTotal).toBe(298);
    expectExactOffsets(text, candidates);
  });

  it('extracts the "12 of 300 ... 20 of 298" form across a clause', () => {
    const text =
      'Death occurred in 12 of 300 patients in the intervention group and 20 of 298 in the control group.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = fractionPairAt(candidates, 0);
    expect(pair.aEvents).toBe(12);
    expect(pair.aTotal).toBe(300);
    expect(pair.bEvents).toBe(20);
    expect(pair.bTotal).toBe(298);
    expectExactOffsets(text, candidates);
  });

  it('rejects a pair whose numerator exceeds its denominator', () => {
    const text = 'A data-entry error left 320/300 vs 62/298 in the table.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });

  it('rejects a month/year pair that looks like a date range', () => {
    const text = 'Patients were enrolled between 3/2019 and 5/2021 at 14 centres.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });

  it('rejects a month/day pair that looks like a date range', () => {
    const text = 'Screening visits took place between 3/15 and 4/20 of the same year.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });

  it('does not pair "of" counts that sit in different sentences', () => {
    const text =
      'Events occurred in 12 of 300 patients. Follow-up was complete in 20 of 298 cases.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });
});

describe('extractNumberCandidates — ratios', () => {
  it('extracts HR with an en dash confidence interval', () => {
    const text =
      'The study drug reduced the risk of the primary endpoint (HR 0.72; 95% CI 0.61–0.85).';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const ratio = ratioAt(candidates, 0);
    expect(ratio.measure).toBe('HR');
    expect(ratio.estimate).toBe(0.72);
    expect(ratio.ciLow).toBe(0.61);
    expect(ratio.ciHigh).toBe(0.85);
    expect(ratio.pValue).toBeNull();
    expectExactOffsets(text, candidates);
  });

  it('extracts HR with a hyphen confidence interval', () => {
    const text =
      'Rehospitalisation was less frequent with the intervention (HR 0.72, 95% CI 0.61-0.85).';
    const candidates = extractNumberCandidates(text);

    const ratio = ratioAt(candidates, 0);
    expect(ratio.ciLow).toBe(0.61);
    expect(ratio.ciHigh).toBe(0.85);
    expectExactOffsets(text, candidates);
  });

  it('extracts the "95% CI, 0.61 to 0.85" wording', () => {
    const text = 'The adjusted hazard ratio was 0.72 (95% CI, 0.61 to 0.85).';
    const candidates = extractNumberCandidates(text);

    const ratio = ratioAt(candidates, 0);
    expect(ratio.measure).toBe('HR');
    expect(ratio.estimate).toBe(0.72);
    expect(ratio.ciLow).toBe(0.61);
    expect(ratio.ciHigh).toBe(0.85);
    expectExactOffsets(text, candidates);
  });

  it('extracts "HR=0.72" with no confidence interval', () => {
    const text = 'Overall survival favoured the experimental arm (HR=0.72).';
    const candidates = extractNumberCandidates(text);

    const ratio = ratioAt(candidates, 0);
    expect(ratio.measure).toBe('HR');
    expect(ratio.estimate).toBe(0.72);
    expect(ratio.ciLow).toBeNull();
    expect(ratio.ciHigh).toBeNull();
    expect(ratio.raw).toBe('HR=0.72');
    expectExactOffsets(text, candidates);
  });

  it('accepts the adjusted prefix aHR', () => {
    const text =
      'Mortality remained lower after adjustment for age and sex (aHR 0.81; 95% CI 0.70-0.94).';
    const candidates = extractNumberCandidates(text);

    const ratio = ratioAt(candidates, 0);
    expect(ratio.measure).toBe('HR');
    expect(ratio.estimate).toBe(0.81);
    expect(ratio.ciLow).toBe(0.7);
    expect(ratio.ciHigh).toBe(0.94);
    expect(ratio.raw.startsWith('aHR')).toBe(true);
    expectExactOffsets(text, candidates);
  });

  it('accepts the adjusted prefix aOR together with a P value', () => {
    const text =
      'Delirium was more common in the older cohort (aOR 1.45; 95% CI 1.10-1.92; P = 0.008).';
    const candidates = extractNumberCandidates(text);

    const ratio = ratioAt(candidates, 0);
    expect(ratio.measure).toBe('OR');
    expect(ratio.estimate).toBe(1.45);
    expect(ratio.pValue).toBe('P = 0.008');
    expectExactOffsets(text, candidates);
  });

  it('captures a P value written without a leading zero', () => {
    const text = 'The composite outcome favoured screening (RR 0.78; 95% CI 0.65-0.94; P<.001).';
    const candidates = extractNumberCandidates(text);

    const ratio = ratioAt(candidates, 0);
    expect(ratio.measure).toBe('RR');
    expect(ratio.pValue).toBe('P<.001');
    expectExactOffsets(text, candidates);
  });

  it('extracts the spelled-out relative risk and odds ratio', () => {
    const text = [
      'The relative risk of 0.85 (95% CI 0.74 to 0.98) favoured the intervention.',
      'The odds ratio was 1.32 (95% CI 1.05-1.66) for the composite outcome.',
    ].join(' ');
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(2);
    expect(ratioAt(candidates, 0).measure).toBe('RR');
    expect(ratioAt(candidates, 0).estimate).toBe(0.85);
    expect(ratioAt(candidates, 1).measure).toBe('OR');
    expect(ratioAt(candidates, 1).estimate).toBe(1.32);
    expectExactOffsets(text, candidates);
  });

  // Real abstracts report several estimates at once, and then the measure is
  // plural. Taken verbatim from PMID 34844936 (tests/fixtures/pubmed).
  it('extracts a plural spelled-out measure', () => {
    const text =
      'Initiation at eGFR15-16 was associated with lower mortality, corresponding to hazard ratios of 0.89 (95% confidence interval 0.87 to 0.92) and 0.94 (0.91 to 0.98), respectively.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    expect(ratioAt(candidates, 0).measure).toBe('HR');
    expect(ratioAt(candidates, 0).estimate).toBe(0.89);
    expect(ratioAt(candidates, 0).ciLow).toBe(0.87);
    expect(ratioAt(candidates, 0).ciHigh).toBe(0.92);
    expectExactOffsets(text, candidates);
  });

  it('accepts "were" between a plural measure and its estimate', () => {
    const text =
      'Relative risks were 1.15 (95% CI 1.02 to 1.30) across the prespecified subgroups.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    expect(ratioAt(candidates, 0).measure).toBe('RR');
    expect(ratioAt(candidates, 0).estimate).toBe(1.15);
    expectExactOffsets(text, candidates);
  });

  it('does not read the lowercase word "or" as an odds ratio', () => {
    const text = 'Stroke or myocardial infarction occurred in 25 patients during follow-up.';
    expect(extractNumberCandidates(text)).toEqual([]);
  });
});

describe('extractNumberCandidates — document level behaviour', () => {
  it('returns an empty array for empty input', () => {
    expect(extractNumberCandidates('')).toEqual([]);
  });

  it('returns an empty array for text with no comparable numbers', () => {
    expect(
      extractNumberCandidates('This multicentre trial enrolled adults with heart failure.'),
    ).toEqual([]);
  });

  it('keeps document order across kinds and validates every offset by slicing the source', () => {
    const text = [
      'BACKGROUND: Readmission after heart failure remains common.',
      'METHODS: We randomly assigned 598 adults to a nurse-led transition programme or usual care.',
      'RESULTS: The primary outcome occurred in 45/300 vs 62/298 patients.',
      'Mortality at 90 days was 12.3% vs 8.1%.',
      'The programme reduced readmission (HR 0.72; 95% CI 0.61–0.85; P = 0.01).',
      'CONCLUSIONS: A nurse-led programme reduced readmission.',
    ].join(' ');
    const candidates = extractNumberCandidates(text);

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'fraction-pair',
      'percent-pair',
      'ratio',
    ]);
    expect(at(candidates, 0).start).toBeLessThan(at(candidates, 1).start);
    expect(at(candidates, 1).start).toBeLessThan(at(candidates, 2).start);
    expectExactOffsets(text, candidates);
  });

  it('attaches the full sentence to every candidate', () => {
    const text = [
      'Stroke occurred in 12 of 300 patients in the intervention group and 20 of 298 in the control group.',
      'The effect persisted after adjustment (aHR 0.62; 95% CI 0.41-0.94).',
    ].join(' ');
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(2);
    expect(at(candidates, 0).sentence).toBe(
      'Stroke occurred in 12 of 300 patients in the intervention group and 20 of 298 in the control group.',
    );
    expect(at(candidates, 1).sentence).toBe(
      'The effect persisted after adjustment (aHR 0.62; 95% CI 0.41-0.94).',
    );
  });

  it('extracts a 400+ word abstract in under 5 ms', () => {
    const paragraph = [
      'BACKGROUND: Readmission within 90 days after hospitalisation for acute heart failure remains',
      'common despite guideline-directed medical therapy, and the value of structured transitional',
      'care is uncertain in community hospitals that lack a dedicated heart failure clinic.',
      'METHODS: In this multicentre, parallel-group, randomised controlled trial we assigned 598',
      'adults hospitalised with acute decompensated heart failure to a nurse-led transitional care',
      'programme or to usual care, with stratification by site and by ejection fraction.',
      'The primary outcome was a composite of unplanned readmission or death from any cause within',
      '90 days after discharge, assessed by an adjudication committee unaware of assignment.',
      'RESULTS: The primary outcome occurred in 45/300 vs 62/298 patients in the two groups.',
      'Death from any cause occurred in 12 of 300 patients in the intervention group and 20 of 298',
      'in the control group during the follow-up period.',
      'Mortality at 90 days was 12.3% vs 8.1%, and the incidence of urgent clinic visits was 18.0%',
      'and 24.5% in the two study arms.',
      'The programme reduced the primary outcome (HR 0.72; 95% CI 0.61-0.85; P = 0.01), and the',
      'effect persisted after adjustment for age, sex, and ejection fraction (aHR 0.74; 95% CI 0.62',
      'to 0.89; P = 0.002).',
      'Serious adverse events were reported in 6.4% versus 7.1% of participants, and the adjusted',
      'odds ratio for any serious adverse event was 0.91 (95% CI 0.62-1.34).',
      'Quality-of-life scores improved by a mean of 8.2 points in the intervention group and by 3.1',
      'points in the control group, a difference that exceeded the prespecified threshold.',
      'CONCLUSIONS: Among adults discharged after hospitalisation for acute heart failure, a',
      'nurse-led transitional care programme reduced the composite of unplanned readmission or',
      'death at 90 days compared with usual care, without an excess of serious adverse events.',
      'These findings support wider adoption of structured transitional care in community settings,',
      'although the open-label design and the single-country recruitment limit generalisability and',
      'the trial was not powered for mortality alone.',
    ].join(' ');
    const text = `${paragraph} ${paragraph}`;
    const wordCount = text.split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(400);

    // Warm up so the measurement is not dominated by first-call JIT work.
    for (let i = 0; i < 5; i += 1) {
      extractNumberCandidates(text);
    }

    const runs = 20;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) {
      extractNumberCandidates(text);
    }
    const perRun = (performance.now() - started) / runs;
    console.log(
      `number-extractor: ${wordCount} words extracted in ${perRun.toFixed(3)} ms per run`,
    );

    expect(extractNumberCandidates(text).length).toBeGreaterThan(0);
    expect(perRun).toBeLessThan(5);
  });

  it('stays linear on pathological input (no catastrophic backtracking)', () => {
    const text = `HR ${'9'.repeat(2000)} 95% CI ${'0'.repeat(2000)}`;
    const started = performance.now();
    extractNumberCandidates(text);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
