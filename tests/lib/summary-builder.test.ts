/**
 * One-page summary export (issue #19, SPEC.ja.md §4.5).
 *
 * The fixtures in tests/fixtures/summary are the reviewed record of exactly
 * what lands on a user's clipboard. Any wording change should therefore reach a
 * reviewer as a diff of those files rather than as a rewritten test, so they are
 * regenerated in one step:
 *
 *   UPDATE_GOLDEN=1 pnpm vitest run tests/lib/summary-builder.test.ts
 *
 * Read the diff afterwards: the golden files are the product copy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { fromCounts, fromRatio } from '../../src/lib/effect-measures';
import { buildSummaryMarkdown, buildSummaryText } from '../../src/lib/summary-builder';
import type { Appraisal, EffectMeasures, NumbersState } from '../../src/lib/types';
import { DISCLAIMER, PRODUCT_NAME } from '../../src/ui/labels';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/summary/', import.meta.url));
const UPDATE_GOLDEN = process.env['UPDATE_GOLDEN'] === '1';
const OPTS = { productName: PRODUCT_NAME };

/** Spec §4.5, verbatim. Asserts something about the paper, so it is only correct
 * when a relative effect was actually recorded. */
const NO_ABSOLUTE_EFFECT = 'Absolute effect not reported in the abstract.';
/** Asserts something about the appraisal: correct when nobody has filled the numbers in. */
const NOT_CALCULATED = 'Absolute effect not calculated in this appraisal.';

function expectGolden(name: string, actual: string): void {
  const path = `${FIXTURE_DIR}${name}`;
  expect(actual.length).toBeGreaterThan(0);
  if (UPDATE_GOLDEN) {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(path, actual, 'utf8');
    return;
  }
  expect(actual).toBe(readFileSync(path, 'utf8'));
}

/* ------------------------------------------------------------------ fixtures */

function emptyInputs(): NumbersState['inputs'] {
  return {
    rates: { cerPercent: '', eerPercent: '' },
    counts: {
      controlEvents: '',
      controlTotal: '',
      interventionEvents: '',
      interventionTotal: '',
    },
    ratio: { measure: 'RR', estimate: '', ciLow: '', ciHigh: '', acrPercent: '' },
  };
}

function numbersState(patch: Partial<NumbersState>): NumbersState {
  return {
    mode: 'rates',
    inputs: emptyInputs(),
    result: null,
    warnings: [],
    sourceCandidate: null,
    ...patch,
  };
}

/** Nothing filled in at all: the worst case the template has to survive. */
function emptyAppraisal(): Appraisal {
  return {
    schemaVersion: 2,
    pmid: '',
    createdAt: 0,
    updatedAt: 0,
    citation: { title: '', authors: [], journal: '', year: '', doi: null },
    designDetected: null,
    designOverride: null,
    subtypeOverride: null,
    pico: { p: '', i: '', c: '', o: '' },
    numbers: null,
    validity: {},
    sourceScope: 'abstract',
    info: {},
    bottomLine: '',
    discussionQuestions: [],
  };
}

const FULL_BOTTOM_LINE =
  'A 10 percentage point difference in 90-day mortality is large for this population, ' +
  'and the trial was stopped early at an interim look, so the estimate is probably optimistic. ' +
  'I would read the methods before taking the size of the effect at face value.';

/** The note on an item whose verdict is still blank: it must not reach the export. */
const UNANSWERED_NOTE = 'Ask the presenter whether the analysis set was intention to treat.';

/** One item was looked up in the full text while the rest came from the abstract. */
const OVERRIDDEN_ITEM_NOTE =
  'The full text names a blinded adjudication committee for the primary endpoint.';

function fullAppraisal(): Appraisal {
  // 78/300 vs 48/300 -> CER 26.0 %, EER 16.0 %, ARR 10.0 points, NNT 10.
  const result: EffectMeasures = fromCounts(78, 300, 48, 300);
  return {
    ...emptyAppraisal(),
    pmid: '38123456',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_900_000,
    citation: {
      title: 'Early mobilisation and 90-day mortality in adults receiving mechanical ventilation',
      authors: ['Smith J', 'Okafor A', 'Lindqvist P', 'Duarte R', 'Nakamura H'],
      journal: 'N Engl J Med',
      year: '2024',
      doi: '10.1056/NEJMoa2400001',
    },
    designDetected: {
      design: 'rct',
      subtype: 'parallel',
      confidence: 'high',
      evidence: [
        { kind: 'publication-type', value: 'Randomized Controlled Trial' },
        { kind: 'keyword', value: 'randomly assigned' },
      ],
    },
    pico: {
      p: 'Adults in intensive care ventilated for at least 48 hours',
      i: 'Structured early mobilisation started within 72 hours of intubation',
      c: 'Usual physiotherapy at the discretion of the treating team',
      o: 'Death from any cause within 90 days',
    },
    numbers: numbersState({
      mode: 'counts',
      inputs: {
        ...emptyInputs(),
        counts: {
          controlEvents: '78',
          controlTotal: '300',
          interventionEvents: '48',
          interventionTotal: '300',
        },
      },
      result,
    }),
    validity: {
      rct: {
        'rct-randomisation-sequence': { verdict: 'yes', note: '', source: null },
        'rct-allocation-concealment': {
          verdict: 'unclear',
          note: 'The abstract says "randomly assigned" and nothing about who held the sequence.',
          source: null,
        },
        'rct-baseline-balance': { verdict: 'yes', note: '', source: null },
        'rct-deviations-from-intervention': {
          verdict: 'no',
          note: 'Open label. Mortality is a hard endpoint, so this matters less here than it would for a symptom score.',
          source: null,
        },
        'rct-missing-outcome-data': { verdict: 'yes', note: '', source: null },
        // The one item the reader went to the full text for.
        'rct-outcome-measurement': {
          verdict: 'yes',
          note: OVERRIDDEN_ITEM_NOTE,
          source: 'full-text',
        },
        'rct-analysis-population': { verdict: null, note: UNANSWERED_NOTE, source: null },
        'rct-prespecification': { verdict: 'no', note: '', source: null },
        // rct-applicability is absent entirely: never opened in the UI.
      },
    },
    info: {
      funder: 'Medical Research Council',
      'sponsor-role': 'No role in design, analysis or the decision to publish.',
      'author-conflicts': 'None declared.',
      'info-source': 'Funding statement in the full text',
    },
    bottomLine: FULL_BOTTOM_LINE,
  };
}

/**
 * The trial this whole guardrail comes from, in outline: non-inferiority was met
 * on a symptom endpoint, and the abstract then claimed it for an outcome that
 * never happened to anybody in either arm.
 */
const NON_INFERIORITY_BOTTOM_LINE =
  'Non-inferiority was met for time to sustained symptom resolution and for nothing else. ' +
  'No participant in either arm died or progressed to severe disease, so the severe-disease ' +
  'claim in the abstract rests on no events at all. I would not repeat it.';

const NI_INTERPRETATION_NOTE =
  'The abstract concludes the drug is non-inferior for preventing severe disease or death, ' +
  'but no participant in either arm reached either outcome.';

const NI_ANALYSIS_SETS_NOTE =
  'The full text reports a per-protocol set alongside the randomised set; which one carried ' +
  'the non-inferiority claim is not stated.';

/** A non-inferiority trial: the general items plus the subtype-specific block. */
function nonInferiorityAppraisal(): Appraisal {
  return {
    ...emptyAppraisal(),
    // A synthetic trial. Deliberately not a real PMID: the citation below is
    // invented, and attaching invented authors and a journal to a real record
    // would be misinformation the moment this fixture appeared in a screenshot.
    pmid: '99999999',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_900_000,
    citation: {
      title:
        'Oral antiviral versus standard care for time to sustained symptom resolution in mild Covid-19',
      authors: ['Tanaka R', 'Oyelaran B', 'Petrov I', 'Whitfield C'],
      journal: 'Lancet Infect Dis',
      year: '2024',
      doi: '10.1016/S1473-3099(24)00001-0',
    },
    designDetected: {
      design: 'rct',
      subtype: 'non-inferiority',
      confidence: 'high',
      evidence: [
        { kind: 'publication-type', value: 'Randomized Controlled Trial' },
        { kind: 'keyword', value: 'non-inferiority margin' },
      ],
    },
    pico: {
      p: 'Outpatient adults under 65 with mild Covid-19 and no chronic illness',
      i: 'Five days of an oral antiviral started within 72 hours of symptom onset',
      c: 'Standard supportive care',
      o: 'Time to sustained resolution of five self-reported symptoms',
    },
    validity: {
      rct: {
        'rct-randomisation-sequence': { verdict: 'yes', note: '', source: null },
        'rct-allocation-concealment': { verdict: 'unclear', note: '', source: null },
        'rct-baseline-balance': { verdict: 'yes', note: '', source: null },
        'rct-deviations-from-intervention': {
          verdict: 'unclear',
          note: 'Open label, and the abstract does not say what happened to participants who stopped early.',
          source: null,
        },
        'rct-missing-outcome-data': { verdict: 'unclear', note: '', source: null },
        'rct-outcome-measurement': {
          verdict: 'no',
          note: 'The symptom diary was completed by unblinded participants, and the endpoint is entirely self-reported.',
          source: null,
        },
        'rct-analysis-population': {
          verdict: 'unclear',
          note: NI_ANALYSIS_SETS_NOTE,
          source: 'full-text',
        },
        'rct-prespecification': { verdict: 'unclear', note: '', source: null },
        'rct-ni-rationale-assay-sensitivity': { verdict: 'unclear', note: '', source: null },
        'rct-ni-margin': { verdict: 'unclear', note: '', source: null },
        'rct-ni-analysis-sets': { verdict: 'unclear', note: '', source: null },
        'rct-ni-interpretation': {
          verdict: 'no',
          note: NI_INTERPRETATION_NOTE,
          source: null,
        },
        'rct-applicability': {
          verdict: 'no',
          note: 'Everyone enrolled was under 65 and free of chronic illness, which is not the group we prescribe this to.',
          source: null,
        },
      },
    },
    // The common and honest case: the money is named, what the sponsor did is not.
    info: {
      funder: 'Meridian Therapeutics',
      'sponsor-role': '',
      'author-conflicts': 'Two authors are employees of the funder.',
      'info-source': '',
    },
    bottomLine: NON_INFERIORITY_BOTTOM_LINE,
  };
}

/** A ratio straight off the abstract with no assumed control event rate to anchor it. */
function ratioOnlyAppraisal(): Appraisal {
  return {
    ...emptyAppraisal(),
    pmid: '31234567',
    citation: {
      title: 'Anticoagulation strategy and recurrent venous thromboembolism',
      authors: ['Novak L', 'Haddad S'],
      journal: 'Lancet',
      year: '2023',
      doi: null,
    },
    designDetected: {
      design: 'cohort',
      subtype: null,
      confidence: 'medium',
      evidence: [{ kind: 'keyword', value: 'prospective cohort' }],
    },
    numbers: numbersState({
      mode: 'ratio',
      inputs: {
        ...emptyInputs(),
        ratio: {
          measure: 'HR',
          estimate: '0.72',
          ciLow: '0.61',
          ciHigh: '0.85',
          acrPercent: '',
        },
      },
    }),
  };
}

/** Same ratio, now anchored to an assumed control event rate: warnings appear. */
function ratioWithAcrAppraisal(): Appraisal {
  const { warnings, ...result } = fromRatio('OR', 1.35, 0.12, { low: 0.98, high: 1.86 });
  return {
    ...emptyAppraisal(),
    pmid: '31234568',
    citation: {
      title: 'Postoperative delirium after two anaesthetic regimens',
      authors: ['Alvarez M'],
      journal: 'Anesthesiology',
      year: '2023',
      doi: '10.1097/ALN.0000000000004000',
    },
    numbers: numbersState({
      mode: 'ratio',
      inputs: {
        ...emptyInputs(),
        ratio: {
          measure: 'OR',
          estimate: '1.35',
          ciLow: '0.98',
          ciHigh: '1.86',
          acrPercent: '12',
        },
      },
      result,
      warnings,
    }),
  };
}

/** The experimental arm does worse: NNH, not NNT. */
function harmAppraisal(): Appraisal {
  // 30/300 vs 52/298 -> CER 10.0 %, EER 17.4 %, harm.
  return {
    ...emptyAppraisal(),
    pmid: '30001111',
    citation: {
      title: 'Liberal oxygen targets and 28-day mortality',
      authors: ['Brandt K', 'Ito S', 'Mensah D', 'Rossi G'],
      journal: 'Crit Care Med',
      year: '2022',
      doi: null,
    },
    designOverride: 'rct',
    sourceScope: 'full-text',
    numbers: numbersState({
      mode: 'counts',
      inputs: {
        ...emptyInputs(),
        counts: {
          controlEvents: '30',
          controlTotal: '300',
          interventionEvents: '52',
          interventionTotal: '298',
        },
      },
      result: fromCounts(30, 300, 52, 298),
    }),
    bottomLine:
      'The harm signal is the whole story here; the abstract leads with the null primary outcome.',
  };
}

/**
 * QA record D (PMID 38537944, docs/QA.md), with the pair the Numbers tab offers
 * loaded the way D3 loads it: 256/90 305 exposed controls as the "control arm"
 * and 891/18 061 exposed cases as the "intervention". The arithmetic runs, and
 * what it produces is not a risk difference (#58).
 */
function caseControlCountsAppraisal(): Appraisal {
  return {
    ...emptyAppraisal(),
    pmid: '38537944',
    citation: {
      title:
        'Use of progestogens and the risk of intracranial meningioma: national case-control study.',
      authors: ['Roland N', 'Neumann A', 'Hoisnard L', 'Duranteau L', 'Froelich S'],
      journal: 'BMJ',
      year: '2024',
      doi: '10.1136/bmj-2023-078078',
    },
    designDetected: {
      design: 'case-control',
      subtype: null,
      confidence: 'medium',
      evidence: [{ kind: 'keyword', value: 'case-control' }],
    },
    numbers: numbersState({
      mode: 'counts',
      inputs: {
        ...emptyInputs(),
        counts: {
          controlEvents: '256',
          controlTotal: '90305',
          interventionEvents: '891',
          interventionTotal: '18061',
        },
      },
      result: fromCounts(256, 90305, 891, 18061),
    }),
  };
}

/** The same record taken the legitimate way: its odds ratio at a supplied baseline. */
function caseControlRatioAppraisal(): Appraisal {
  const { warnings, ...result } = fromRatio('OR', 3.49, 0.01, { low: 2.38, high: 5.1 });
  return {
    ...caseControlCountsAppraisal(),
    numbers: numbersState({
      mode: 'ratio',
      inputs: {
        ...emptyInputs(),
        ratio: { measure: 'OR', estimate: '3.49', ciLow: '2.38', ciHigh: '5.10', acrPercent: '1' },
      },
      result,
      warnings,
    }),
  };
}

const PIPED_OUTCOME = 'Composite of death | rehospitalisation | stroke at 12 months';
const PIPED_NOTE =
  'Reported as p < 0.05 | no effect size | no interval, so nothing can be recomputed.';

/** User text with pipes and a line break in it must not break the Markdown tables. */
function pipeAppraisal(): Appraisal {
  return {
    ...emptyAppraisal(),
    pmid: '29998888',
    citation: {
      title: 'Composite endpoints in cardiology trials',
      authors: ['Ferreira J'],
      journal: 'Eur Heart J',
      year: '2021',
      doi: null,
    },
    pico: {
      p: 'Adults with heart failure\n(NYHA class II to III)',
      i: 'Device therapy',
      c: 'Medical therapy alone',
      o: PIPED_OUTCOME,
    },
    validity: {
      unclear: {
        'unclear-precision': { verdict: 'no', note: PIPED_NOTE, source: null },
      },
    },
  };
}

/* ------------------------------------------------------------------ Markdown */

describe('buildSummaryMarkdown', () => {
  it('matches the golden file for a full appraisal', () => {
    expectGolden('full-appraisal.md', buildSummaryMarkdown(fullAppraisal(), OPTS));
  });

  it('matches the golden file for an empty appraisal, with every section still present', () => {
    const md = buildSummaryMarkdown(emptyAppraisal(), OPTS);

    for (const heading of [
      '# ',
      '## Clinical question (PICO)',
      '## Study design',
      '## Key results',
      '## Critical appraisal',
      '### Internal validity',
      '### Applicability',
      '### Funding & conflicts',
      '### Notes on flagged items',
      '## Bottom line',
      '## Discussion questions',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain(NOT_CALCULATED);
    expect(md).not.toContain(NO_ABSOLUTE_EFFECT);
    expectGolden('empty-appraisal.md', md);
  });

  it('says the absolute effect is missing when only a ratio was entered', () => {
    const md = buildSummaryMarkdown(ratioOnlyAppraisal(), OPTS);

    expect(md).toContain('HR 0.72 (95% CI 0.61–0.85)');
    // Here the claim is true: a hazard ratio was recorded and no absolute effect.
    expect(md).toContain(NO_ABSOLUTE_EFFECT);
    expect(md).not.toContain(NOT_CALCULATED);
    expect(md).not.toContain('NNT');
    expectGolden('ratio-only.md', md);
  });

  // Regression: found by exporting a real appraisal of PMID 36577095, whose
  // abstract reports "67.4% vs. 77.3%". The export claimed the abstract did not
  // report an absolute effect, when the truth was that nobody had calculated one.
  it('does not blame the abstract when the user simply has not filled the numbers in', () => {
    const md = buildSummaryMarkdown(emptyAppraisal(), OPTS);
    const text = buildSummaryText(emptyAppraisal(), OPTS);

    for (const rendering of [md, text]) {
      expect(rendering).toContain(NOT_CALCULATED);
      expect(rendering).not.toContain('not reported in the abstract');
    }
  });

  it('renders the estimated absolute effect and its warnings when an ACR was supplied', () => {
    const md = buildSummaryMarkdown(ratioWithAcrAppraisal(), OPTS);

    expect(md).not.toContain(NO_ABSOLUTE_EFFECT);
    expect(md).toContain('assumed control event rate');
    expect(md).toContain('Odds ratios overstate risk changes');
    expectGolden('ratio-with-acr.md', md);
  });

  it('reports NNH and an absolute risk increase when the intervention arm does worse', () => {
    const md = buildSummaryMarkdown(harmAppraisal(), OPTS);

    expect(md).toContain('ARI (absolute risk increase)');
    expect(md).toContain('RRI (relative risk increase)');
    expect(md).toMatch(/NNH \d+ \(95% CI \d+–\d+\)/);
    expect(md).not.toContain('NNT');
    expectGolden('harm.md', md);
  });

  it('matches the golden file when user text contains a pipe', () => {
    expectGolden('pipe-escaping.md', buildSummaryMarkdown(pipeAppraisal(), OPTS));
  });

  it('escapes pipes so every table row keeps the same cell count', () => {
    const md = buildSummaryMarkdown(pipeAppraisal(), OPTS);
    // Split on unescaped pipes only: an escaped \| is content, not a cell border.
    const cellCount = (row: string): number => row.split(/(?<!\\)\|/).length;
    const tables: number[][] = [];
    for (const line of md.split('\n')) {
      if (!line.startsWith('|')) {
        if (tables.at(-1)?.length !== 0) tables.push([]);
        continue;
      }
      if (tables.length === 0) tables.push([]);
      tables.at(-1)?.push(cellCount(line));
    }
    const widths = tables.filter((table) => table.length > 0).map((table) => new Set(table));

    expect(widths).toHaveLength(3); // PICO, internal validity, applicability
    expect(md).toContain('death \\| rehospitalisation');
    for (const width of widths) expect(width.size).toBe(1);
  });

  it('copies the bottom line verbatim and never writes one', () => {
    expect(buildSummaryMarkdown(fullAppraisal(), OPTS)).toContain(FULL_BOTTOM_LINE);

    const empty = buildSummaryMarkdown(emptyAppraisal(), OPTS);
    const afterHeading = empty.split('## Bottom line')[1] ?? '';
    expect(afterHeading.split('## Discussion questions')[0]?.trim()).toBe('');
  });

  it('renders unanswered checklist items as a dash and keeps their notes out of the export', () => {
    const md = buildSummaryMarkdown(fullAppraisal(), OPTS);

    // rct-analysis-population (no verdict) and rct-applicability (never opened).
    expect(md.match(/\| — \|/g)).toHaveLength(2);
    expect(md).not.toContain(UNANSWERED_NOTE);
    expect(md).toContain('Item 2: The abstract says "randomly assigned"');
    expect(md).toContain('Item 4: Open label.');
    expect(md).toContain('Item 8: (no note)');
  });

  it('labels a manual override as set by the user, not as a detection', () => {
    const a = { ...ratioOnlyAppraisal(), designOverride: 'unclear' as const };
    const md = buildSummaryMarkdown(a, OPTS);

    // The detected cohort design is replaced, and "Not detected" would misdescribe
    // a design the user picked on purpose.
    expect(md).toContain('**Unclear / other**');
    expect(md).toContain('Set manually.');
    expect(md).not.toContain('prospective cohort');
  });

  it('emits three empty numbered lines when there are no discussion questions', () => {
    const md = buildSummaryMarkdown(emptyAppraisal(), OPTS);
    const section = md.split('## Discussion questions')[1] ?? '';

    expect(
      section
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3),
    ).toEqual(['1.', '2.', '3.']);
  });
});

/* ------------------------------------------------------- the study design line */

describe('the study design block', () => {
  it('puts the subtype on a line of its own rather than in a parenthesis', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);
    const text = buildSummaryText(nonInferiorityAppraisal(), OPTS);

    expect(md).toContain('**Randomized controlled trial**');
    expect(md).toContain('Non-inferiority design');
    expect(md).not.toContain('(non-inferiority)');
    expect(text).toContain('  Randomized controlled trial\n  Non-inferiority design\n');
  });

  it('omits the subtype line when there is no subtype', () => {
    const md = buildSummaryMarkdown(harmAppraisal(), OPTS);
    const design = (md.split('## Study design')[1] ?? '').split('## Key results')[0] ?? '';

    expect(design.trim().split('\n\n')).toEqual([
      '**Randomized controlled trial**',
      'Set manually.',
    ]);
  });

  it('switches the subtype checks on from a manual subtype, and says it was manual', () => {
    // Detection found a plain parallel trial; the reader knows better.
    const a: Appraisal = { ...fullAppraisal(), subtypeOverride: 'non-inferiority' };
    const md = buildSummaryMarkdown(a, OPTS);

    expect(md).toContain('Non-inferiority design (set manually)');
    expect(md).toContain('Detected from publication type.');
    expect(md).toContain('### Non-inferiority-specific checks');
    expect(md).toContain(NON_INFERIORITY_GUARDRAIL);
  });

  it('does not repeat "set manually" when the design itself was overridden', () => {
    const a: Appraisal = { ...harmAppraisal(), subtypeOverride: 'non-inferiority' };
    const md = buildSummaryMarkdown(a, OPTS);

    expect(md).toContain('Non-inferiority design\n');
    expect(md).not.toContain('(set manually)');
    expect(md).toContain('### Non-inferiority-specific checks');
  });
});

/* --------------------------------------------------------- critical appraisal */

/** In the caller's words, so a reworded caution has to be re-read, not skipped. */
const NON_INFERIORITY_GUARDRAIL = 'Carry this result no further than the outcome it was tested on.';
const NO_EVENTS_CAUTION = 'carries no non-inferiority claim, however few events it recorded';
const ADDITIONAL_NOT_INSTEAD = 'Every item under Internal validity still applies';
const APPLICABILITY_LEAD = 'Applicability is not internal validity.';
const UNCLEAR_IS_A_LIMIT = 'it records a limit on what the reader could check, not a fault found';

describe('the critical appraisal section', () => {
  it('matches the golden files for a non-inferiority appraisal', () => {
    expectGolden('non-inferiority.md', buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS));
    expectGolden('non-inferiority.txt', buildSummaryText(nonInferiorityAppraisal(), OPTS));
  });

  it('adds the subtype block without letting it replace the general items', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);
    const positionOf = (needle: string): number => md.indexOf(needle);

    expect(md).toContain('### Non-inferiority-specific checks');
    expect(md).toContain(ADDITIONAL_NOT_INSTEAD);
    expect(positionOf('### Internal validity')).toBeLessThan(
      positionOf('### Non-inferiority-specific checks'),
    );
    // The general items are still numbered 1..8 above the extra block.
    expect(md).toContain('| 8 |');
    expect(md).toContain('| 12 |');
  });

  it('cautions that non-inferiority stops at the endpoint that was tested', () => {
    for (const rendering of [
      buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS),
      buildSummaryText(nonInferiorityAppraisal(), OPTS),
    ]) {
      expect(rendering).toContain(NON_INFERIORITY_GUARDRAIL);
      expect(rendering).toContain('it is not a finding of equivalence');
      expect(rendering).toContain('it is not a finding of superiority');
      expect(rendering).toContain(NO_EVENTS_CAUTION);
    }
  });

  it('shows no subtype block when no subtype group applies', () => {
    for (const appraisal of [fullAppraisal(), harmAppraisal(), emptyAppraisal()]) {
      const md = buildSummaryMarkdown(appraisal, OPTS);
      expect(md).not.toContain('Non-inferiority-specific checks');
      expect(md).not.toContain(NON_INFERIORITY_GUARDRAIL);
    }
  });

  it('keeps applicability visibly apart from internal validity', () => {
    const md = buildSummaryMarkdown(fullAppraisal(), OPTS);
    const text = buildSummaryText(fullAppraisal(), OPTS);

    expect(md.indexOf('### Internal validity')).toBeLessThan(md.indexOf('### Applicability'));
    expect(md).toContain(APPLICABILITY_LEAD);
    expect(text).toContain(APPLICABILITY_LEAD);

    // The single rct applicability item sits under the applicability heading and
    // nowhere else: the internal validity table stops at item 8.
    const internal =
      (md.split('### Internal validity')[1] ?? '').split('### Applicability')[0] ?? '';
    const applicability = (md.split('### Applicability')[1] ?? '').split('### Funding')[0] ?? '';
    expect(internal).toContain('| 8 |');
    expect(internal).not.toContain('| 9 |');
    expect(applicability).toContain('| 9 |');
  });

  it('states the source the appraisal was made from before any verdict', () => {
    const md = buildSummaryMarkdown(fullAppraisal(), OPTS);
    const section = md.split('## Critical appraisal')[1] ?? '';

    expect(section.indexOf('Appraised from: Abstract only.')).toBeLessThan(
      section.indexOf('### Internal validity'),
    );
    expect(section).toContain(UNCLEAR_IS_A_LIMIT);
    expect(buildSummaryText(harmAppraisal(), OPTS)).toContain('Appraised from: Full text.');
  });

  it('shows a per-item source only where it departs from the appraisal default', () => {
    const md = buildSummaryMarkdown(fullAppraisal(), OPTS);
    const text = buildSummaryText(fullAppraisal(), OPTS);

    expect(md).toContain('| Yes (source: Full text) |');
    expect(text).toContain('Verdict: Yes (source: Full text)');
    // Exactly one item was overridden; the other seven answers inherit silently.
    expect(md.match(/\(source: /g)).toHaveLength(1);
    expect(md).toContain('| Yes |');
  });

  it('does not treat an item recorded against the appraisal default as an override', () => {
    const base = fullAppraisal();
    const answers = base.validity['rct'] ?? {};
    const a: Appraisal = {
      ...base,
      validity: {
        rct: {
          ...answers,
          'rct-randomisation-sequence': { verdict: 'yes', note: '', source: 'abstract' },
        },
      },
    };

    expect(buildSummaryMarkdown(a, OPTS).match(/\(source: /g)).toHaveLength(1);
  });

  it('separates a No from an Unclear in the notes', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);
    const noBlock =
      (md.split('Items answered No')[1] ?? '').split('Items answered Unclear')[0] ?? '';
    const unclearBlock = md.split('Items answered Unclear')[1] ?? '';

    expect(md).toContain('judgements the reader made');
    expect(md).toContain('which is not a finding');
    expect(noBlock).toContain(NI_INTERPRETATION_NOTE);
    expect(unclearBlock).toContain(NI_ANALYSIS_SETS_NOTE);
    expect(unclearBlock).not.toContain(NI_INTERPRETATION_NOTE);
  });

  it('explains an Unclear the reader could not have settled from the source they had', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);

    // rct-allocation-concealment needs the full text; rct-prespecification needs
    // the protocol. Neither Unclear is a criticism of the trial.
    expect(md).toContain('Item 2: Usually needs the full text');
    expect(md).toContain('Item 8: Usually needs the protocol');
  });

  it('says None in both note lists when nothing was flagged', () => {
    const md = buildSummaryMarkdown(emptyAppraisal(), OPTS);
    const notes = md.split('### Notes on flagged items')[1] ?? '';

    expect(notes.match(/- None\./g)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------- funding */

describe('the funding block', () => {
  it('records a named funder with an unrecorded sponsor role as exactly that', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);
    const text = buildSummaryText(nonInferiorityAppraisal(), OPTS);
    const block = (md.split('### Funding & conflicts')[1] ?? '').split('### Notes')[0] ?? '';

    expect(block).toContain('- Funder: Meridian Therapeutics');
    expect(block).toContain('- Sponsor or funder role: Not recorded.');
    expect(text).toContain('Funder:');
    expect(text).toContain('Not recorded.');
  });

  it('carries no verdict column and no score', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);
    const block = (md.split('### Funding & conflicts')[1] ?? '').split('### Notes')[0] ?? '';

    expect(block).not.toContain('Verdict');
    expect(block).not.toContain('|');
    expect(block).toContain('Industry funding is not by itself a source of bias');
    expect(block).toContain('not that there was nothing to record');
  });

  it('renders every declared field as not recorded when nothing was entered', () => {
    const md = buildSummaryMarkdown(emptyAppraisal(), OPTS);
    const block = (md.split('### Funding & conflicts')[1] ?? '').split('### Notes')[0] ?? '';

    expect(block).toContain('Not recorded.');
    expect(block).not.toContain('None.');
  });
});

/* ---------------------------------------------------------------- plain text */

describe('buildSummaryText', () => {
  it('matches the golden file for a full appraisal', () => {
    expectGolden('full-appraisal.txt', buildSummaryText(fullAppraisal(), OPTS));
  });

  it('matches the golden file for an empty appraisal, with every section still present', () => {
    const text = buildSummaryText(emptyAppraisal(), OPTS);

    for (const heading of [
      'CLINICAL QUESTION (PICO)',
      'STUDY DESIGN',
      'KEY RESULTS',
      'CRITICAL APPRAISAL',
      'Internal validity',
      'Applicability',
      'Funding & conflicts',
      'Notes on flagged items',
      'BOTTOM LINE',
      'DISCUSSION QUESTIONS',
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain(NOT_CALCULATED);
    expect(text).not.toContain(NO_ABSOLUTE_EFFECT);
    expectGolden('empty-appraisal.txt', text);
  });

  it('contains no Markdown syntax', () => {
    const markdownSyntax: ReadonlyArray<readonly [string, RegExp]> = [
      ['ATX heading', /^\s*#/m],
      ['table pipe', /\|/],
      ['emphasis', /\*/],
      ['inline link', /\]\(/],
      ['bullet marker', /^\s*[-*+] /m],
      ['blockquote', /^\s*> /m],
      ['code span or fence', /`/],
      ['setext underline or rule', /^\s*(=+|-{3,})\s*$/m],
    ];

    // Every appraisal whose own text is free of these characters: what the user
    // typed is passed through untouched, so only our own syntax is under test.
    for (const appraisal of [
      fullAppraisal(),
      emptyAppraisal(),
      nonInferiorityAppraisal(),
      ratioOnlyAppraisal(),
      ratioWithAcrAppraisal(),
      harmAppraisal(),
      caseControlCountsAppraisal(),
    ]) {
      const text = buildSummaryText(appraisal, OPTS);
      for (const [name, pattern] of markdownSyntax) {
        expect(`${name}: ${pattern.test(text)}`).toBe(`${name}: false`);
      }
    }
  });

  it('passes a pipe typed by the user through unescaped', () => {
    const text = buildSummaryText(pipeAppraisal(), OPTS);

    expect(text).toContain(PIPED_OUTCOME);
    expect(text).toContain(PIPED_NOTE);
    expect(text).not.toContain('\\|');
  });

  it('keeps the same section order as the Markdown export', () => {
    const md = buildSummaryMarkdown(nonInferiorityAppraisal(), OPTS);
    const text = buildSummaryText(nonInferiorityAppraisal(), OPTS);
    const order = (haystack: string, needles: string[]): number[] =>
      needles.map((needle) => haystack.indexOf(needle));
    const isAscending = (positions: number[]): boolean =>
      positions.every(
        (position, i) => position > -1 && (i === 0 || position > (positions[i - 1] ?? -1)),
      );

    expect(
      isAscending(
        order(md, [
          '## Clinical question (PICO)',
          '## Study design',
          '## Key results',
          '## Critical appraisal',
          '### Internal validity',
          '### Non-inferiority-specific checks',
          '### Applicability',
          '### Funding & conflicts',
          '### Notes on flagged items',
          '## Bottom line',
          '## Discussion questions',
          DISCLAIMER,
        ]),
      ),
    ).toBe(true);
    expect(
      isAscending(
        order(text, [
          'CLINICAL QUESTION (PICO)',
          'STUDY DESIGN',
          'KEY RESULTS',
          'CRITICAL APPRAISAL',
          'Internal validity',
          'Non-inferiority-specific checks',
          'Applicability',
          'Funding & conflicts',
          'Notes on flagged items',
          'BOTTOM LINE',
          'DISCUSSION QUESTIONS',
          DISCLAIMER,
        ]),
      ),
    ).toBe(true);
  });
});

/* ------------------------------------------------------- the design caveat */

/** In the caller's words: the sentence that makes the NNH above it unreadable as one. */
const CASE_CONTROL_CAVEAT = 'A case-control study samples on the outcome';
const CROSS_SECTIONAL_CAVEAT = 'A cross-sectional study measures prevalence at one point in time';

describe('the design caveat on a result (#58)', () => {
  it('matches the golden files for a case-control Counts result', () => {
    expectGolden(
      'case-control-counts.md',
      buildSummaryMarkdown(caseControlCountsAppraisal(), OPTS),
    );
    expectGolden('case-control-counts.txt', buildSummaryText(caseControlCountsAppraisal(), OPTS));
  });

  it('carries the case-control caveat once, under the result it qualifies, in both formats', () => {
    const md = buildSummaryMarkdown(caseControlCountsAppraisal(), OPTS);
    const text = buildSummaryText(caseControlCountsAppraisal(), OPTS);

    expect(md).toContain(`- ${CASE_CONTROL_CAVEAT}`);
    for (const [rendering, nextSection] of [
      [md, '## Critical appraisal'],
      [text, 'CRITICAL APPRAISAL'],
    ] as const) {
      expect(rendering.split(CASE_CONTROL_CAVEAT)).toHaveLength(2);
      expect(rendering.indexOf('NNH ')).toBeLessThan(rendering.indexOf(CASE_CONTROL_CAVEAT));
      expect(rendering.indexOf(CASE_CONTROL_CAVEAT)).toBeLessThan(rendering.indexOf(nextSection));
      // One line: the caveat never wraps onto a second line of its own.
      const line = rendering.split('\n').find((l) => l.includes(CASE_CONTROL_CAVEAT)) ?? '';
      expect(line.trimStart()).toMatch(/^(- )?A case-control study .* a baseline risk you choose\.$/);
    }
  });

  it('leaves a Ratio-mode result on the same case-control record without it', () => {
    for (const rendering of [
      buildSummaryMarkdown(caseControlRatioAppraisal(), OPTS),
      buildSummaryText(caseControlRatioAppraisal(), OPTS),
    ]) {
      expect(rendering).toContain('NNH 42 (95% CI 26–75)');
      expect(rendering).not.toContain(CASE_CONTROL_CAVEAT);
      // The ratio's own warnings are still there: only the caveat is absent.
      expect(rendering).toContain('Odds ratios overstate risk changes');
    }
  });

  it('says nothing when there is no result to qualify', () => {
    const a: Appraisal = {
      ...caseControlCountsAppraisal(),
      numbers: numbersState({ mode: 'counts' }),
    };

    expect(buildSummaryMarkdown(a, OPTS)).not.toContain(CASE_CONTROL_CAVEAT);
    expect(buildSummaryMarkdown(a, OPTS)).not.toContain('Notes on these numbers');
  });

  it('follows the design in force, not the one detected when the result was calculated', () => {
    const asCohort: Appraisal = { ...caseControlCountsAppraisal(), designOverride: 'cohort' };
    const asCrossSectional: Appraisal = {
      ...caseControlCountsAppraisal(),
      designOverride: 'cross-sectional',
    };
    const trialAsCaseControl: Appraisal = { ...fullAppraisal(), designOverride: 'case-control' };

    expect(buildSummaryMarkdown(asCohort, OPTS)).not.toContain(CASE_CONTROL_CAVEAT);
    expect(buildSummaryMarkdown(asCrossSectional, OPTS)).toContain(CROSS_SECTIONAL_CAVEAT);
    expect(buildSummaryMarkdown(asCrossSectional, OPTS)).not.toContain(CASE_CONTROL_CAVEAT);
    expect(buildSummaryText(trialAsCaseControl, OPTS)).toContain(CASE_CONTROL_CAVEAT);
  });

  it('adds nothing to a trial result', () => {
    for (const appraisal of [fullAppraisal(), harmAppraisal()]) {
      const md = buildSummaryMarkdown(appraisal, OPTS);
      expect(md).not.toContain(CASE_CONTROL_CAVEAT);
      expect(md).not.toContain(CROSS_SECTIONAL_CAVEAT);
    }
  });
});

/* ---------------------------------------------------------------- disclaimer */

describe('the disclaimer', () => {
  it('is the last line of both formats', () => {
    for (const appraisal of [fullAppraisal(), emptyAppraisal(), nonInferiorityAppraisal()]) {
      for (const output of [
        buildSummaryMarkdown(appraisal, OPTS),
        buildSummaryText(appraisal, OPTS),
      ]) {
        const lines = output.split('\n');
        expect(lines.pop()).toBe(''); // exactly one trailing newline
        expect(lines.pop()).toBe(DISCLAIMER);
      }
    }
  });

  it('uses the product name from opts', () => {
    const md = buildSummaryMarkdown(emptyAppraisal(), { productName: 'Appraisal Buddy' });

    expect(
      md
        .trimEnd()
        .endsWith(
          'Generated with Appraisal Buddy for educational purposes. Verify against the full text.',
        ),
    ).toBe(true);
  });
});
