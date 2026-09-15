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

/** Spec §4.5: this exact sentence, not a placeholder. */
const NO_ABSOLUTE_EFFECT = 'Absolute effect not reported in the abstract.';

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
    schemaVersion: 1,
    pmid: '',
    createdAt: 0,
    updatedAt: 0,
    citation: { title: '', authors: [], journal: '', year: '', doi: null },
    designDetected: null,
    designOverride: null,
    pico: { p: '', i: '', c: '', o: '' },
    numbers: null,
    validity: {},
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
        'rct-randomization': { verdict: 'yes', note: '' },
        'rct-allocation-concealment': {
          verdict: 'unclear',
          note: 'The abstract says "randomly assigned" and nothing about who held the sequence.',
        },
        'rct-blinding': {
          verdict: 'no',
          note: 'Open label. Mortality is a hard endpoint, so this matters less here than it would for a symptom score.',
        },
        'rct-baseline-comparability': { verdict: 'yes', note: '' },
        'rct-follow-up': { verdict: 'yes', note: '' },
        'rct-intention-to-treat': { verdict: null, note: UNANSWERED_NOTE },
        'rct-primary-outcome': { verdict: 'yes', note: '' },
        'rct-funding': { verdict: 'no', note: '' },
        // rct-applicability is absent entirely: never opened in the UI.
      },
    },
    bottomLine: FULL_BOTTOM_LINE,
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
        'unclear-reporting': { verdict: 'no', note: PIPED_NOTE },
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
      '## Validity',
      '## Bottom line',
      '## Discussion questions',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain(NO_ABSOLUTE_EFFECT);
    expectGolden('empty-appraisal.md', md);
  });

  it('says the absolute effect is missing when only a ratio was entered', () => {
    const md = buildSummaryMarkdown(ratioOnlyAppraisal(), OPTS);

    expect(md).toContain('HR 0.72 (95% CI 0.61–0.85)');
    expect(md).toContain(NO_ABSOLUTE_EFFECT);
    expect(md).not.toContain('NNT');
    expectGolden('ratio-only.md', md);
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

    expect(widths).toHaveLength(2); // PICO and validity
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

    // rct-intention-to-treat (no verdict) and rct-applicability (never opened).
    expect(md.match(/\| — \|/g)).toHaveLength(2);
    expect(md).not.toContain(UNANSWERED_NOTE);
    expect(md).toContain('Item 2 (Unclear):');
    expect(md).toContain('Item 3 (No):');
    expect(md).toContain('Item 8 (No): (no note)');
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
      'VALIDITY',
      'BOTTOM LINE',
      'DISCUSSION QUESTIONS',
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain(NO_ABSOLUTE_EFFECT);
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
      ratioOnlyAppraisal(),
      ratioWithAcrAppraisal(),
      harmAppraisal(),
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
    const md = buildSummaryMarkdown(fullAppraisal(), OPTS);
    const text = buildSummaryText(fullAppraisal(), OPTS);
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
          '## Validity',
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
          'VALIDITY',
          'BOTTOM LINE',
          'DISCUSSION QUESTIONS',
          DISCLAIMER,
        ]),
      ),
    ).toBe(true);
  });
});

/* ---------------------------------------------------------------- disclaimer */

describe('the disclaimer', () => {
  it('is the last line of both formats', () => {
    for (const appraisal of [fullAppraisal(), emptyAppraisal()]) {
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
