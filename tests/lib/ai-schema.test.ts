import { describe, expect, it } from 'vitest';
import {
  EXTRACTION_JSON_SCHEMA,
  MAX_FIELD_LENGTH,
  MAX_NUMBERS,
  MAX_QUESTIONS,
  groundExtraction,
  parseExtraction,
} from '../../src/lib/ai/schema';
import { AiParseError, type AiExtraction, type AiInput } from '../../src/lib/ai/types';
import { extractNumberCandidates } from '../../src/lib/number-extractor';

const VALID: AiExtraction = {
  pico: {
    p: 'Adults with suspected MI',
    i: 'Streptokinase',
    c: 'Placebo',
    o: '5-week vascular mortality',
  },
  numbers: [{ label: 'Vascular deaths, streptokinase first', text: '9.2% vs 12.0%' }],
  limitations: ['Allocation concealment is not described; the full text would settle it.'],
  discussionQuestions: ['Does the benefit depend on time from symptom onset?'],
};

function parseError(text: string): AiParseError {
  try {
    parseExtraction(text);
  } catch (error) {
    expect(error).toBeInstanceOf(AiParseError);
    return error as AiParseError;
  }
  throw new Error('expected parseExtraction to throw');
}

describe('parseExtraction', () => {
  it('reads a well-formed reply', () => {
    expect(parseExtraction(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('tolerates a code fence or a sentence around the object', () => {
    const fenced = 'Here it is:\n```json\n' + JSON.stringify(VALID) + '\n```\n';
    expect(parseExtraction(fenced)).toEqual(VALID);
  });

  it('ignores keys it does not know', () => {
    const extra = { ...VALID, overallRating: 'high', pico: { ...VALID.pico, s: 'x' } };
    expect(parseExtraction(JSON.stringify(extra))).toEqual(VALID);
  });

  it.each([
    ['prose with no object', 'I cannot help with that.'],
    ['broken JSON', '{"pico": {'],
    ['an array', '[1, 2]'],
    ['pico missing', JSON.stringify({ ...VALID, pico: undefined })],
    [
      'a PICO field that is not a string',
      JSON.stringify({ ...VALID, pico: { ...VALID.pico, o: 3 } }),
    ],
    ['numbers not an array', JSON.stringify({ ...VALID, numbers: '9.2% vs 12.0%' })],
    ['a number without text', JSON.stringify({ ...VALID, numbers: [{ label: 'x' }] })],
    ['a limitation that is not a string', JSON.stringify({ ...VALID, limitations: [{}] })],
    ['questions missing', JSON.stringify({ ...VALID, discussionQuestions: undefined })],
    [
      'a well-formed but empty answer',
      JSON.stringify({
        pico: { p: '', i: ' ', c: '', o: '' },
        numbers: [],
        limitations: [''],
        discussionQuestions: [],
      }),
    ],
  ])('refuses %s', (_name, text) => {
    expect(parseError(text).kind).toBe('parse');
  });

  it('trims oversized answers instead of refusing them', () => {
    const long = 'x'.repeat(MAX_FIELD_LENGTH + 50);
    const questions = Array.from({ length: 8 }, (_, n) => `Question ${n}?`);
    const parsed = parseExtraction(
      JSON.stringify({
        ...VALID,
        pico: { ...VALID.pico, p: long },
        discussionQuestions: questions,
      }),
    );
    expect(parsed.pico.p).toHaveLength(MAX_FIELD_LENGTH);
    expect(parsed.pico.p.endsWith('…')).toBe(true);
    expect(parsed.discussionQuestions).toEqual(questions.slice(0, MAX_QUESTIONS));
  });

  it('does not split a surrogate pair when trimming', () => {
    const text = 'x'.repeat(MAX_FIELD_LENGTH - 2) + '😀' + 'tail';
    const clipped = parseExtraction(JSON.stringify({ ...VALID, pico: { ...VALID.pico, p: text } }))
      .pico.p;
    expect(clipped.endsWith('…')).toBe(true);
    const beforeEllipsis = clipped.charCodeAt(clipped.length - 2);
    expect(beforeEllipsis >= 0xd800 && beforeEllipsis <= 0xdbff).toBe(false);
  });

  it('drops empty entries and trims whitespace', () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...VALID,
        numbers: [{ label: 'none', text: '  ' }],
        limitations: ['', '  One.  '],
      }),
    );
    expect(parsed.numbers).toEqual([]);
    expect(parsed.limitations).toEqual(['One.']);
  });

  it('asks the API for the same keys it reads', () => {
    expect([...EXTRACTION_JSON_SCHEMA.required].sort()).toEqual(Object.keys(VALID).sort());
    expect([...EXTRACTION_JSON_SCHEMA.properties.pico.required].sort()).toEqual(
      Object.keys(VALID.pico).sort(),
    );
    expect([...EXTRACTION_JSON_SCHEMA.properties.numbers.items.required].sort()).toEqual(
      Object.keys(VALID.numbers[0]!).sort(),
    );
  });
});

describe('groundExtraction', () => {
  const input: AiInput = {
    title: 'ISIS-2: streptokinase, aspirin, both, or neither',
    abstract:
      'In 17 187 patients, vascular mortality was 791/8592 (9·2%) among patients allocated streptokinase vs\n1029/8595 (12.0%) with placebo; odds reduction 25% (2p < 0.00001).',
    publicationTypes: ['Randomized Controlled Trial'],
  };

  function withNumbers(...texts: string[]): AiExtraction {
    return { ...VALID, numbers: texts.map((text) => ({ label: 'Deaths', text })) };
  }
  const kept = (extraction: AiExtraction) =>
    groundExtraction(extraction, input).numbers.map((n) => n.text);

  it('keeps a pair copied verbatim, across a line break and a Lancet decimal point', () => {
    const span = '791/8592 (9.2%) among patients allocated streptokinase vs 1029/8595 (12.0%)';
    expect(kept(withNumbers(span))).toEqual([span]);
  });

  it.each([
    ['a figure the abstract does not contain', '9.2% vs 12.1%'],
    ['a rounded figure', '791/8592 (9%)'],
    ['a derived figure', 'ARR 2.8% and 25%'],
    ['a reordered pair', '1029/8595 vs 791/8592'],
    ['a lone short figure that would match almost anything', '25%'],
    ['text without a number', 'streptokinase'],
  ])('drops %s', (_name, text) => {
    expect(kept(withNumbers(text))).toEqual([]);
  });

  it('drops a number whose label carries a figure of its own', () => {
    const extraction = {
      ...VALID,
      numbers: [{ label: 'NNT 36 favouring placebo', text: '791/8592 (9·2%)' }],
    };
    expect(groundExtraction(extraction, input).numbers).toEqual([]);
  });

  it('grounds before it trims, so invented entries cannot crowd out a real one', () => {
    const invented = Array.from({ length: MAX_NUMBERS }, (_, n) => `${n}.5% vs ${n}.6%`);
    expect(kept(withNumbers(...invented, '791/8592 (9·2%)'))).toEqual(['791/8592 (9·2%)']);
  });

  it('drops a limitation or question carrying a figure the text does not, and keeps the rest', () => {
    const grounded = groundExtraction(
      {
        ...VALID,
        limitations: ['The 25% odds reduction is relative.', 'An ARR of 2.8 points is small.'],
        discussionQuestions: [
          'What does a 2.8-point difference mean at the bedside?',
          'Would the 17 187 patients resemble ours?',
        ],
      },
      input,
    );
    expect(grounded.limitations).toEqual(['The 25% odds reduction is relative.']);
    expect(grounded.discussionQuestions).toEqual(['Would the 17 187 patients resemble ours?']);
  });

  it('empties a PICO field with an invented figure and accepts figures from the title', () => {
    const grounded = groundExtraction(
      { ...VALID, pico: { ...VALID.pico, p: '18 000 adults', o: 'ISIS-2 primary outcome' } },
      input,
    );
    expect(grounded.pico.p).toBe('');
    expect(grounded.pico.o).toBe('ISIS-2 primary outcome');
  });

  it('keeps a candidate the extractor can then read when the abstract writes the pair adjacently', () => {
    const adjacent: AiInput = { ...input, abstract: 'Mortality was 9.2% vs 12.0% at 35 days.' };
    const [number] = groundExtraction(withNumbers('9.2% vs 12.0%'), adjacent).numbers;
    expect(number).toBeDefined();
    expect(extractNumberCandidates(number!.text)).toHaveLength(1);
  });
});
