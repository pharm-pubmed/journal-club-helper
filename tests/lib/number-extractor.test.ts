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

  // BMJ house style (#49). Verbatim from PMID 36740866 (tests/fixtures/pubmed).
  it('reads BMJ\'s bare "v" as the connector', () => {
    const text =
      'Awake prone positioning reduced the risk of endotracheal intubation compared with usual care (crude average 24.2% v 29.8%, relative risk 0.83, 95% confidence interval 0.73 to 0.94; high certainty).';
    const candidates = extractNumberCandidates(text);

    expect(candidates.map((candidate) => candidate.kind)).toEqual(['percent-pair', 'ratio']);
    const pair = percentPairAt(candidates, 0);
    expect(pair.first).toBe(24.2);
    expect(pair.second).toBe(29.8);
    expect(pair.connector).toBe('vs');
    expect(pair.raw).toBe('24.2% v 29.8%');
    expectExactOffsets(text, candidates);
  });

  it('does not read "v" inside a word, "v." or a capital V as a connector', () => {
    for (const text of [
      'Deficiency was corrected in 12% vitamin 15% of the placebo arm.',
      'Response rates were 30% IV 20% oral across the study arms.',
      'Response rates were 30%v 20% across the study arms.',
      'Response rates were 30% v. 20% across the study arms.',
      'Response rates were 30% V 20% across the tumour stages.',
      'Relapse occurred in 3/10 IV 4/12 of the enrolled patients.',
      'Relapse occurred in 45/300 (15.0%) V 62/298 of the enrolled patients.',
    ]) {
      expect(extractNumberCandidates(text), text).toEqual([]);
    }
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

    expect(candidates).toHaveLength(1);
    const pair = fractionPairAt(candidates, 0);
    expect(pair.aEvents).toBe(45);
    expect(pair.bTotal).toBe(298);
    // Read by the slash pattern, not as two arms with prose between them.
    expect(pair.raw).toBe('45/300 (15.0%) vs 62/298');
    expectExactOffsets(text, candidates);
  });

  // #49, verbatim from PMID 38537944 as the page extractor hands it over: the
  // thin spaces that group the thousands are plain spaces by then.
  it('reads space-grouped thousands and BMJ\'s "v" in a slash pair', () => {
    const text =
      'A highly increased risk of meningioma was observed for cyproterone acetate (891/18 061 (4.9%) v 256/90 305 (0.3%), odds ratio 19.21 (95% confidence interval 16.61 to 22.22)), nomegestrol acetate (925/18 061 (5.1%) v 1121/90 305 (1.2%), 4.93 (4.50 to 5.41)), and chlormadinone acetate (628/18 061 (3.5%) v 946/90 305 (1.0%), 3.87 (3.48 to 4.30)), which were used as positive controls for use.';
    const candidates = extractNumberCandidates(text);

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'fraction-pair',
      'ratio',
      'fraction-pair',
      'fraction-pair',
    ]);
    const pair = fractionPairAt(candidates, 0);
    expect(pair.aEvents).toBe(891);
    expect(pair.aTotal).toBe(18061);
    expect(pair.bEvents).toBe(256);
    expect(pair.bTotal).toBe(90305);
    expect(pair.raw).toBe('891/18 061 (4.9%) v 256/90 305');
    expect(fractionPairAt(candidates, 2).bEvents).toBe(1121);
    expect(fractionPairAt(candidates, 3).aEvents).toBe(628);
    expectExactOffsets(text, candidates);
  });

  it('reads thousands grouped by a thin or narrow no-break space, keeping the raw text', () => {
    const text = 'Cases were exposed more often (891/18\u2009061 (4.9%) v 256/90\u202F305 (0.3%)).';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = fractionPairAt(candidates, 0);
    expect(pair.aTotal).toBe(18061);
    expect(pair.bTotal).toBe(90305);
    expect(pair.raw).toBe('891/18\u2009061 (4.9%) v 256/90\u202F305');
    expectExactOffsets(text, candidates);
  });

  it('reads space-grouped thousands in the "n of N" form', () => {
    // Before #49 this read as 9 of 18 and 11 of 90: a wrong pair, not a miss.
    const text = 'Exposure was found in 9 of 18 061 cases and 11 of 90 305 controls.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(1);
    const pair = fractionPairAt(candidates, 0);
    expect(pair.aEvents).toBe(9);
    expect(pair.aTotal).toBe(18061);
    expect(pair.bEvents).toBe(11);
    expect(pair.bTotal).toBe(90305);
    expectExactOffsets(text, candidates);
  });

  it('groups only whole 3-digit groups after a single separator', () => {
    for (const text of [
      'Exposure was found in 9/18 0612 v 11/90 305 of those screened.',
      'Exposure was found in 9/18 06 v 11/90 305 of those screened.',
      'Exposure was found in 9/18  061 v 11/90 305 of those screened.',
    ]) {
      expect(extractNumberCandidates(text), text).toEqual([]);
    }
  });

  // ISIS-2, PMID 2899772 (tests/fixtures/eutils), verbatim.
  it('pairs two "n/N (x%)" arms separated by prose, one comparison at a time', () => {
    const text =
      'Streptokinase alone and aspirin alone each produced a highly significant reduction in 5-week vascular mortality: 791/8592 (9.2%) among patients allocated streptokinase infusion vs 1029/8595 (12.0%) among those allocated placebo infusion (odds reduction: 25% SD 4; 2p less than 0.00001); 804/8587 (9.4%) vascular deaths among patients allocated aspirin tablets vs 1016/8600 (11.8%) among those allocated placebo tablets (odds reduction: 23% SD 4; 2p less than 0.00001).';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(2);
    const first = fractionPairAt(candidates, 0);
    expect(first.aEvents).toBe(791);
    expect(first.aTotal).toBe(8592);
    expect(first.bEvents).toBe(1029);
    expect(first.bTotal).toBe(8595);
    expect(first.raw).toBe(
      '791/8592 (9.2%) among patients allocated streptokinase infusion vs 1029/8595 (12.0%)',
    );
    // The clause between 1029/8595 and 804/8587 keeps those two apart.
    const second = fractionPairAt(candidates, 1);
    expect(second.aEvents).toBe(804);
    expect(second.bEvents).toBe(1016);
    expectExactOffsets(text, candidates);
  });

  it('pairs prose-separated arms joined by "compared with" or BMJ\'s "v"', () => {
    const text =
      'Readmission occurred in 45/300 (15.0%) patients in the programme compared with 62/298 (20.8%) patients given usual care, and death in 12/300 (4.0%) patients in the programme v 20/298 (6.7%) patients given usual care.';
    const candidates = extractNumberCandidates(text);

    expect(candidates).toHaveLength(2);
    expect(fractionPairAt(candidates, 0).aEvents).toBe(45);
    expect(fractionPairAt(candidates, 0).bEvents).toBe(62);
    expect(fractionPairAt(candidates, 1).aEvents).toBe(12);
    expect(fractionPairAt(candidates, 1).bEvents).toBe(20);
    expectExactOffsets(text, candidates);
  });

  it('does not pair prose-separated arms unless every condition holds', () => {
    for (const text of [
      // A digit in the prose: two time points of one arm, not two arms.
      'Mortality was 10/100 (10.0%) at 30 days vs 15/100 (15.0%) at 90 days in the same patients.',
      // A percentage that is not the arm's own: 45/300 is 15.0%.
      'Readmission occurred in 45/300 (25.0%) patients in the programme vs 62/298 (20.8%) patients given usual care.',
      // "and" joins subgroups at least as often as it compares arms.
      'Death occurred in 10/100 (10.0%) of the men enrolled and 20/100 (20.0%) of the women enrolled.',
      // No connector at all.
      'Adherence was 10/100 (10.0%) in the first year, rising later to 20/100 (20.0%) of those still enrolled.',
      // More than 80 characters of prose.
      'Readmission occurred in 45/300 (15.0%) patients who were allocated to the nurse-led transitional care programme after discharge vs 62/298 (20.8%) patients given usual care.',
    ]) {
      expect(extractNumberCandidates(text), text).toEqual([]);
    }
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

  it('stays linear on a long run of space-grouped digits', () => {
    const text = `1${' 000'.repeat(1000)} (1%) vs 1${' 000'.repeat(1000)}/1${' 000'.repeat(1000)}`;
    const started = performance.now();
    extractNumberCandidates(text);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
