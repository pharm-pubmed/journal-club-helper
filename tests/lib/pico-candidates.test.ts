import { describe, expect, it } from 'vitest';
import {
  findPicoCandidates,
  type PicoCandidate,
  type PicoField,
} from '../../src/lib/pico-candidates';
import { extractNumberCandidates } from '../../src/lib/number-extractor';
import type { AbstractSection } from '../../src/lib/types';

const MAX_PHRASE_LENGTH = 120;

type Article = Parameters<typeof findPicoCandidates>[0];

function article(abstract: string, abstractSections: AbstractSection[] = [], title = ''): Article {
  return { abstract, abstractSections, title };
}

function inField(candidates: PicoCandidate[], field: PicoField): PicoCandidate[] {
  return candidates.filter((candidate) => candidate.field === field);
}

function texts(candidates: PicoCandidate[]): string[] {
  return candidates.map((candidate) => candidate.text);
}

/**
 * The contract the PICO tab renders <mark> from: every abstract-derived candidate
 * must slice back to its own text, and title candidates must use the documented
 * out-of-band offsets.
 */
function expectExactOffsets(abstract: string, candidates: PicoCandidate[]): void {
  for (const candidate of candidates) {
    expect(candidate.text.length).toBeLessThanOrEqual(MAX_PHRASE_LENGTH);
    if (candidate.reason === 'title') {
      expect(candidate.start).toBe(-1);
      expect(candidate.end).toBe(-1);
      continue;
    }
    expect(candidate.start).toBeGreaterThanOrEqual(0);
    expect(candidate.end).toBeGreaterThan(candidate.start);
    expect(abstract.slice(candidate.start, candidate.end)).toBe(candidate.text);
  }
}

/** True when `offset` falls inside a number: "12|.3", "0.|12", or "18 |061". */
function splitsNumber(text: string, offset: number): boolean {
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  if (/\d[.,]?$/.test(before) && /^[.,]?\d/.test(after)) return true;
  return (
    /\d[ \u00A0\u2009\u202F]?$/.test(before) && /^[ \u00A0\u2009\u202F]?\d{3}(?!\d)/.test(after)
  );
}

function expectNoSplitNumbers(text: string, candidates: PicoCandidate[]): void {
  for (const candidate of candidates.filter((item) => item.start >= 0)) {
    expect(splitsNumber(text, candidate.start), candidate.text).toBe(false);
    expect(splitsNumber(text, candidate.end), candidate.text).toBe(false);
  }
}

/* ------------------------------------------------------------------ fixtures */

const HF_TITLE =
  'Nurse-led transitional care after hospitalisation for heart failure: a randomised trial.';

const HF_SECTIONS: AbstractSection[] = [
  {
    label: 'BACKGROUND',
    text: 'Readmission within 90 days after hospitalisation for acute heart failure remains common despite guideline-directed medical therapy.',
  },
  {
    label: 'METHODS',
    text: 'In this multicentre, parallel-group trial we enrolled 598 adults with acute decompensated heart failure at 14 community hospitals. Participants were randomized to a nurse-led transitional care programme or to usual care. The primary outcome was a composite of unplanned readmission or death from any cause within 90 days.',
  },
  {
    label: 'RESULTS',
    text: 'The primary outcome occurred in 45/300 vs 62/298 patients (HR 0.72; 95% CI 0.61-0.85; P = 0.01). Mortality at 90 days was 12.3% vs 8.1%.',
  },
  {
    label: 'CONCLUSIONS',
    text: 'Among adults with acute heart failure, a nurse-led programme reduced readmission compared with usual care.',
  },
];

const HF_ABSTRACT = HF_SECTIONS.map((section) => section.text).join('\n\n');

/** Unstructured: one paragraph, `abstractSections` empty. */
const PNEUMONIA_ABSTRACT =
  'We studied whether early mobilisation shortens hospital stay after pneumonia. ' +
  'We enrolled 240 patients with community-acquired pneumonia admitted to two teaching hospitals, and 118 were assigned to an early mobilisation programme while 122 received standard care. ' +
  'The primary outcome was length of stay, measured from admission to medically ready discharge. ' +
  'Median stay was 5.1 days versus 6.4 days, and readmission occurred in 9.2% vs 11.0% of participants.';

/** The abstract keeps the section labels inline, so the sections do not rejoin into it. */
const SEPSIS_ABSTRACT =
  'BACKGROUND: Septic shock remains a leading cause of intensive care mortality.\n\n' +
  'METHODS: Adults with septic shock were randomly assigned to early vasopressin or to placebo within six hours.\n\n' +
  'RESULTS: Mortality at 28 days was 24.0% vs 31.0%.';

const SEPSIS_SECTIONS: AbstractSection[] = [
  {
    label: 'BACKGROUND',
    text: 'Septic shock remains a leading cause of intensive care mortality.',
  },
  {
    label: 'METHODS',
    text: 'Adults with septic shock were randomly assigned to early vasopressin or to placebo within six hours.',
  },
  { label: 'RESULTS', text: 'Mortality at 28 days was 24.0% vs 31.0%.' },
];

/* ------------------------------------------------- structured abstract: P/I/C/O */

describe('findPicoCandidates — structured abstract', () => {
  it('draws P from the methods section and keeps exact offsets', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const p = inField(candidates, 'P');

    expect(texts(p)).toEqual([
      'adults with acute decompensated heart failure at 14 community hospitals',
      'Participants were randomized to a nurse-led transitional care programme or to usual care',
      HF_TITLE,
    ]);
    expect(p[0]?.reason).toBe('adults with');
    expect(p[1]?.reason).toBe('participants');
    expectExactOffsets(HF_ABSTRACT, candidates);
  });

  it('draws I from the randomisation cue', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const i = inField(candidates, 'I');

    expect(texts(i)).toEqual([
      'were randomized to a nurse-led transitional care programme or to usual care',
      HF_TITLE,
    ]);
    expect(i[0]?.reason).toBe('were randomized to');
    expectExactOffsets(HF_ABSTRACT, candidates);
  });

  it('draws C from the comparator cue inside methods only', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const c = inField(candidates, 'C');

    expect(texts(c)).toEqual(['usual care', HF_TITLE]);
    // "compared with usual care" lives in CONCLUSIONS, which is not a methods-like section.
    expect(texts(c).some((text) => text.startsWith('compared with'))).toBe(false);
    expectExactOffsets(HF_ABSTRACT, candidates);
  });

  it('draws O from the primary-outcome cue and from result sentences that carry numbers', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const o = inField(candidates, 'O');

    expect(o).toHaveLength(3);
    expect(o[0]?.text).toBe(
      'primary outcome was a composite of unplanned readmission or death from any cause within 90 days',
    );
    expect(o[0]?.reason).toBe('primary outcome');
    expect(o[1]?.text).toContain('45/300 vs 62/298');
    expect(o[1]?.reason).toBe('numeric result');
    expect(o[2]?.text).toContain('12.3% vs 8.1%');
    expect(o[2]?.reason).toBe('numeric result');
    // The O field never offers the title: a title is a population/intervention hint, not a result.
    expect(o.some((candidate) => candidate.reason === 'title')).toBe(false);
    expectExactOffsets(HF_ABSTRACT, candidates);
  });

  it('ignores population wording outside the methods-like sections', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const conclusionStart = HF_ABSTRACT.indexOf('Among adults with');

    expect(conclusionStart).toBeGreaterThan(0);
    for (const candidate of inField(candidates, 'P')) {
      expect(candidate.start).toBeLessThan(conclusionStart);
    }
    expectExactOffsets(HF_ABSTRACT, candidates);
  });
});

/* ---------------------------------------------- unstructured abstract fallback */

describe('findPicoCandidates — unstructured abstract', () => {
  it('scans the whole abstract when there are no sections', () => {
    const candidates = findPicoCandidates(article(PNEUMONIA_ABSTRACT, [], ''));

    expect(texts(inField(candidates, 'P'))).toEqual([
      'patients with community-acquired pneumonia admitted to two teaching hospitals',
      'participants',
    ]);
    expect(texts(inField(candidates, 'I'))).toEqual([
      'assigned to an early mobilisation programme while 122 received standard care',
    ]);
    expect(texts(inField(candidates, 'C'))).toEqual(['standard care', 'versus 6.4 days']);
    expectExactOffsets(PNEUMONIA_ABSTRACT, candidates);
  });

  it('stops a capture at a comma but not at a decimal point', () => {
    const candidates = findPicoCandidates(article(PNEUMONIA_ABSTRACT, [], ''));
    const versus = inField(candidates, 'C').find((candidate) => candidate.reason === 'versus');

    // "versus 6.4 days, and readmission..." — the period inside 6.4 is not a boundary.
    expect(versus?.text).toBe('versus 6.4 days');
    expectExactOffsets(PNEUMONIA_ABSTRACT, candidates);
  });

  it('finds an O candidate from the numeric sentence even without a results section', () => {
    const candidates = findPicoCandidates(article(PNEUMONIA_ABSTRACT, [], ''));
    const o = inField(candidates, 'O');

    expect(texts(o)).toEqual([
      'primary outcome was length of stay',
      'measured from admission to medically ready discharge',
      'Median stay was 5.1 days versus 6.4 days, and readmission occurred in 9.2% vs 11.0% of participants.',
    ]);
    expectExactOffsets(PNEUMONIA_ABSTRACT, candidates);
  });
});

/* --------------------------------------------------- sections vs abstract text */

describe('findPicoCandidates — section offset mapping', () => {
  it('maps offsets back into the abstract when the sections do not rejoin it', () => {
    const rejoined = SEPSIS_SECTIONS.map((section) => section.text).join('\n\n');
    expect(rejoined).not.toBe(SEPSIS_ABSTRACT);

    const candidates = findPicoCandidates(article(SEPSIS_ABSTRACT, SEPSIS_SECTIONS, ''));

    expect(texts(inField(candidates, 'P'))).toEqual([
      'Adults with septic shock were randomly assigned to early vasopressin or to placebo within six hours',
    ]);
    expect(texts(inField(candidates, 'I'))).toEqual([
      'assigned to early vasopressin or to placebo within six hours',
    ]);
    expect(texts(inField(candidates, 'C'))).toEqual(['placebo within six hours']);
    expectExactOffsets(SEPSIS_ABSTRACT, candidates);
  });

  it('falls back to the whole abstract when no section text can be located', () => {
    const bogus: AbstractSection[] = [
      { label: 'METHODS', text: 'text that is not present in the abstract at all' },
    ];
    const candidates = findPicoCandidates(article(PNEUMONIA_ABSTRACT, bogus, ''));

    expect(inField(candidates, 'P').length).toBeGreaterThan(0);
    expectExactOffsets(PNEUMONIA_ABSTRACT, candidates);
  });
});

/* ------------------------------------------------------------ caps and dedupe */

describe('findPicoCandidates — length cap, field cap, dedupe', () => {
  it('never returns a candidate longer than 120 characters and never cuts a word', () => {
    const sections: AbstractSection[] = [
      {
        label: 'METHODS',
        text: 'We enrolled adults with chronic obstructive pulmonary disease who had experienced at least two moderate exacerbations during the preceding twelve months and who remained symptomatic despite maximal inhaled therapy at nine referral centres.',
      },
    ];
    const abstract = sections[0]?.text ?? '';
    const candidates = findPicoCandidates(article(abstract, sections, ''));
    const p = inField(candidates, 'P');

    expect(p).toHaveLength(1);
    const candidate = p[0];
    expect(candidate?.text.length).toBeLessThanOrEqual(MAX_PHRASE_LENGTH);
    expect(candidate?.text.startsWith('adults with chronic obstructive pulmonary disease')).toBe(
      true,
    );
    // The cut lands on a word boundary, so the panel never shows half a word.
    expect(candidate?.text.trimEnd()).toBe(candidate?.text);
    expect(/\s/.test(abstract.charAt(candidate?.end ?? 0))).toBe(true);
    expectExactOffsets(abstract, candidates);
  });

  it('caps a field at five candidates and drops the title candidate when the field is full', () => {
    const sections: AbstractSection[] = [
      {
        label: 'METHODS',
        text: 'We enrolled 120 patients with type 2 diabetes, 80 adults with prediabetes, 40 children with obesity, 60 women at high cardiovascular risk, 55 men with resistant hypertension, and 30 participants from a prior cohort.',
      },
    ];
    const abstract = sections[0]?.text ?? '';
    const candidates = findPicoCandidates(
      article(abstract, sections, 'A trial in six populations.'),
    );
    const p = inField(candidates, 'P');

    expect(p).toHaveLength(5);
    expect(p.some((candidate) => candidate.reason === 'title')).toBe(false);
    expect(texts(p)).toEqual([
      'patients with type 2 diabetes',
      'adults with prediabetes',
      'children with obesity',
      'women at high cardiovascular risk',
      'men with resistant hypertension',
    ]);
    expectExactOffsets(abstract, candidates);
  });

  it('deduplicates overlapping spans, keeping the longer one', () => {
    const sections: AbstractSection[] = [
      {
        label: 'METHODS',
        text: 'We enrolled women and men with stable angina at three sites. Each patient received open-label aspirin.',
      },
    ];
    const abstract = sections[0]?.text ?? '';
    const candidates = findPicoCandidates(article(abstract, sections, ''));

    // "men with stable angina at three sites" is contained in the "women ..." span.
    expect(texts(inField(candidates, 'P'))).toEqual([
      'women and men with stable angina at three sites',
    ]);
    expect(texts(inField(candidates, 'I'))).toEqual(['received open-label aspirin']);
    expectExactOffsets(abstract, candidates);
  });

  it('returns candidates grouped P, I, C, O with document order inside each field', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const order: PicoField[] = ['P', 'I', 'C', 'O'];
    const seen = candidates.map((candidate) => candidate.field);
    const grouped = [...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b));

    expect(seen).toEqual(grouped);
    for (const field of order) {
      const positions = inField(candidates, field)
        .filter((candidate) => candidate.reason !== 'title')
        .map((candidate) => candidate.start);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
    expectExactOffsets(HF_ABSTRACT, candidates);
  });
});

/* ------------------------------------------------------------------- the title */

describe('findPicoCandidates — title candidate', () => {
  it('offers the title to P, I and C with the documented out-of-band offsets', () => {
    const candidates = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, HF_TITLE));
    const titleCandidates = candidates.filter((candidate) => candidate.reason === 'title');

    expect(titleCandidates.map((candidate) => candidate.field)).toEqual(['P', 'I', 'C']);
    for (const candidate of titleCandidates) {
      expect(candidate.text).toBe(HF_TITLE);
      // The title is not part of the abstract, so its offsets cannot index into it:
      // -1 / -1 is the sentinel, and slice(-1, -1) is the empty string, so a consumer
      // that renders a <mark> from the offsets without checking renders nothing.
      expect(candidate.start).toBe(-1);
      expect(candidate.end).toBe(-1);
      expect(HF_ABSTRACT.slice(candidate.start, candidate.end)).toBe('');
    }
    expectExactOffsets(HF_ABSTRACT, candidates);
  });

  it('truncates a very long title at a word boundary and omits it when the title is empty', () => {
    const longTitle =
      'Effect of a nurse-led, pharmacist-supported transitional care programme on unplanned readmission or death within 90 days after hospitalisation for acute decompensated heart failure: a multicentre randomised clinical trial.';
    expect(longTitle.length).toBeGreaterThan(MAX_PHRASE_LENGTH);

    const withTitle = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, longTitle));
    const titled = withTitle.filter((candidate) => candidate.reason === 'title');
    expect(titled).toHaveLength(3);
    for (const candidate of titled) {
      expect(candidate.text.length).toBeLessThanOrEqual(MAX_PHRASE_LENGTH);
      expect(longTitle.startsWith(candidate.text)).toBe(true);
      expect(candidate.text.endsWith(' ')).toBe(false);
    }

    expectExactOffsets(HF_ABSTRACT, withTitle);

    const withoutTitle = findPicoCandidates(article(HF_ABSTRACT, HF_SECTIONS, '   '));
    expect(withoutTitle.some((candidate) => candidate.reason === 'title')).toBe(false);
    expectExactOffsets(HF_ABSTRACT, withoutTitle);
  });
});

/* ------------------------------------------------------------------ empty input */

describe('findPicoCandidates — empty input', () => {
  it('returns [] for an empty abstract even when a title is available', () => {
    expect(findPicoCandidates(article('', [], HF_TITLE))).toEqual([]);
    expect(findPicoCandidates(article('   \n\n  ', HF_SECTIONS, HF_TITLE))).toEqual([]);
  });

  it('returns [] when no cue matches', () => {
    const abstract = 'This editorial argues that journal clubs deserve protected time.';
    expect(findPicoCandidates(article(abstract, [], ''))).toEqual([]);
  });
});

/* ----------------------------------------------------------------- performance */

describe('findPicoCandidates — performance', () => {
  it('scans a 400+ word abstract in under 5 ms', () => {
    const paragraph = [
      'BACKGROUND: Readmission within 90 days after hospitalisation for acute heart failure remains',
      'common despite guideline-directed medical therapy, and the value of structured transitional',
      'care is uncertain in community hospitals that lack a dedicated heart failure clinic.',
      'METHODS: In this multicentre, parallel-group trial we enrolled 598 adults with acute',
      'decompensated heart failure at 14 community hospitals; participants were randomized to a',
      'nurse-led transitional care programme or to usual care, and women and men were enrolled in',
      'equal numbers. Patients with end-stage renal disease were excluded, and children with',
      'congenital heart disease were not eligible. The primary outcome was a composite of unplanned',
      'readmission or death from any cause within 90 days after discharge, measured by an',
      'adjudication committee unaware of assignment.',
      'RESULTS: The primary outcome occurred in 45/300 vs 62/298 patients in the two groups.',
      'Mortality at 90 days was 12.3% vs 8.1%, and the programme reduced the primary endpoint',
      '(HR 0.72; 95% CI 0.61-0.85; P = 0.01). Serious adverse events were reported in 6.4% versus',
      '7.1% of participants who received the intervention or the control treatment.',
      'CONCLUSIONS: Among adults with acute heart failure, a nurse-led transitional care programme',
      'reduced the composite of unplanned readmission or death at 90 days compared with usual care,',
      'without an excess of serious adverse events, although the open-label design and the',
      'single-country recruitment limit generalisability.',
    ].join(' ');
    const abstract = `${paragraph} ${paragraph}`;
    const wordCount = abstract.split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(400);

    const input = article(abstract, [], HF_TITLE);
    for (let i = 0; i < 5; i += 1) {
      findPicoCandidates(input);
    }

    const runs = 20;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) {
      findPicoCandidates(input);
    }
    const perRun = (performance.now() - started) / runs;
    console.log(`pico-candidates: ${wordCount} words scanned in ${perRun.toFixed(3)} ms per run`);

    expectExactOffsets(abstract, findPicoCandidates(input));
    expect(findPicoCandidates(input).length).toBeGreaterThan(0);
    expect(perRun).toBeLessThan(5);
  });

  it('stays linear on pathological input (no catastrophic backtracking)', () => {
    const abstract = `patients with ${'a'.repeat(4000)} ${'1'.repeat(4000)} received placebo`;
    const started = performance.now();
    const candidates = findPicoCandidates(article(abstract, [], ''));
    expect(performance.now() - started).toBeLessThan(50);
    expectExactOffsets(abstract, candidates);
  });
});

describe('population sections', () => {
  // Verbatim from PMID 34844936 (tests/fixtures/pubmed/cohort-34844936.html).
  // None of the P cues matches this wording, so before the section rule this
  // abstract produced no P candidate at all.
  const sections: AbstractSection[] = [
    {
      label: 'DESIGN',
      text: 'Observational study using target trial emulation in a nationwide registry.',
    },
    {
      label: 'PARTICIPANTS',
      text: 'Patients had a baseline eGFR between 10 and 20 mL/min/1.73 m2 and were included between 1 January 2007 and 31 December 2016, with follow-up until 1 June 2017.',
    },
  ];
  const abstract = sections.map((section) => section.text).join('\n\n');

  it('offers the opening phrase of a labelled participants section as P', () => {
    const candidates = findPicoCandidates(article(abstract, sections));
    const population = inField(candidates, 'P');

    // Truncated by the 120-character cap, retreated to a whole word.
    expect(texts(population)).toContain(
      'Patients had a baseline eGFR between 10 and 20 mL/min/1.73 m2 and were included between 1 January 2007 and 31 December',
    );
    expect(population[0]?.reason).toBe('participants section');
    expectExactOffsets(abstract, candidates);
  });

  it('does not invent a population candidate for an unstructured abstract', () => {
    const plain = 'Patients had a baseline eGFR between 10 and 20 mL/min/1.73 m2.';
    const population = inField(findPicoCandidates(article(plain)), 'P');

    // The rule keys off the section label, so with no sections there is nothing
    // to key off; the whole-text cue scan is deliberately not a fallback here.
    expect(population.every((candidate) => !candidate.reason.endsWith('section'))).toBe(true);
  });

  it('ignores an outcome section label that merely mentions measures', () => {
    const outcomeSections: AbstractSection[] = [
      { label: 'MAIN OUTCOME MEASURES', text: 'Five year all cause mortality was estimated.' },
    ];
    const text = outcomeSections[0]!.text;
    const population = inField(findPicoCandidates(article(text, outcomeSections)), 'P');

    expect(population.every((candidate) => !candidate.reason.endsWith('section'))).toBe(true);
  });
});

describe('space-grouped numbers (#49)', () => {
  // Verbatim from PMID 38537944 as the page extractor hands it over: BMJ groups
  // thousands with a thin space, which is a plain space by then. The numeric
  // result window used to start at "061 cases (0.2%)", halfway through 18 061.
  const sections: AbstractSection[] = [
    {
      label: 'PARTICIPANTS',
      text: 'Of 108 366 women overall, 18 061 women living in France who had intracranial surgery for meningioma between 1 January 2009 and 31 December 2018 (restricted inclusion periods for intrauterine systems) were deemed to be in the case group.',
    },
    {
      label: 'RESULTS',
      text: 'Mean age was 57.6 years (standard deviation 12.8). Analyses showed excess risk of meningioma with use of medrogestone (42 exposed cases/18 061 cases (0.2%) v 79 exposed controls/90 305 controls (0.1%), odds ratio 3.49 (95% confidence interval 2.38 to 5.10)), medroxyprogesterone acetate (injectable, 9/18 061 (0.05%) v 11/90 305 (0.01%), 5.55 (2.27 to 13.56)), and promegestone (83/18 061 (0.5%) v 225/90 305 (0.2 %), 2.39 (1.85 to 3.09)).',
    },
  ];
  const abstract = sections.map((section) => section.text).join('\n\n');

  it('never starts or ends a candidate inside a space-grouped number', () => {
    const candidates = findPicoCandidates(article(abstract, sections));
    expect(inField(candidates, 'O').length).toBeGreaterThan(0);
    expectNoSplitNumbers(abstract, candidates);
  });

  it('never starts or ends a window inside a number, however long the figures are', () => {
    // 126 characters of figures, longer than any window: nothing to window.
    const long =
      'Relapse occurred in 1,234,567,890 of 9,876,543,210 patients who were allocated to the much longer programme, versus 2,345,678,901 of 8,765,432,109 given usual care at every site.';
    expect(
      extractNumberCandidates(long).some((candidate) => candidate.end - candidate.start > 120),
    ).toBe(true);
    // The window's natural end falls inside the number glued to the figures.
    const glued =
      'Across the eleven participating centres and the two follow-up visits that were scheduled after discharge, mortality was 12.3% vs 8.1%/0.1234567890123456789012345 at one year.';

    for (const text of [long, glued]) {
      const candidates = findPicoCandidates(article(text));
      expectNoSplitNumbers(text, candidates);
      expectExactOffsets(text, candidates);
    }
  });
});
