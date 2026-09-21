/**
 * Validity checklist schema + wording guard (issues #13, #14).
 *
 * Two jobs:
 *   1. Structural validation of every file in src/data/checklists, so a
 *      hand-edited JSON file that breaks the contract fails CI instead of
 *      breaking the Validity tab at runtime.
 *   2. A plagiarism guard. Spec §4.4 and §9 require the shipped wording to be
 *      written from scratch: the well-known published appraisal instruments are
 *      licensed for non-commercial use and this product is commercial. The test
 *      compares every shipped question against tests/fixtures/forbidden-phrases.json,
 *      a test-only corpus of distinctive stems from those instruments.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  VERDICT_HELP,
  allChecklists,
  getChecklist,
  type Checklist,
  type ChecklistItem,
} from '../../src/lib/checklist-schema';
import { STUDY_DESIGNS, type StudyDesign } from '../../src/lib/types';
import forbiddenFixture from '../fixtures/forbidden-phrases.json';

const CHECKLIST_DIR = fileURLToPath(new URL('../../src/data/checklists/', import.meta.url));

/** Spec §4.4: one checklist per design, and 'non-randomized-trial' reuses rct. */
const EXPECTED_FILES = [
  'case-control',
  'cohort',
  'cross-sectional',
  'diagnostic',
  'rct',
  'sr-ma',
  'unclear',
];

const MIN_ITEMS = 6;
const MAX_ITEMS = 10;
const MAX_QUESTION_LENGTH = 200;

/**
 * Jaccard similarity over word sets, above which a shipped question is treated
 * as a copy of a published instrument.
 *
 * 0.5 means the two sentences share half of their combined vocabulary. Two
 * sentences about the same epidemiological concept, written independently,
 * land far below that because they only share function words and the concept
 * noun: the highest score any shipped question currently reaches against the
 * 63-entry corpus is 0.25, and that match is pure function-word overlap
 * ("was", "the", "study"). A verbatim copy scores 1.0 and a reworded copy —
 * the same sentence with a word or two swapped — scores 0.93; both self-tests
 * are at the bottom of this file.
 * The threshold therefore sits in a wide empty band between "same topic" and
 * "same sentence".
 */
const SIMILARITY_THRESHOLD = 0.5;

/** Observed headroom guard: the real questions must stay well under the threshold. */
const MAX_OBSERVED_SIMILARITY = 0.35;

const forbiddenPhrases: string[] = forbiddenFixture.phrases;

/* ------------------------------------------------------------------ helpers */

function readChecklistFile(name: string): unknown {
  return JSON.parse(readFileSync(`${CHECKLIST_DIR}${name}.json`, 'utf8'));
}

/** Lowercase, drop punctuation, collapse whitespace. */
function normalize(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(sentence: string): Set<string> {
  return new Set(normalize(sentence).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Closest entry in the forbidden corpus, with its similarity score. */
function closestForbidden(sentence: string): { phrase: string; score: number } {
  const target = words(sentence);
  let best = { phrase: '', score: 0 };
  for (const phrase of forbiddenPhrases) {
    const score = jaccard(target, words(phrase));
    if (score > best.score) best = { phrase, score };
  }
  return best;
}

const checklists = allChecklists();
const allItems: ChecklistItem[] = checklists.flatMap((checklist) => checklist.items);

/* ------------------------------------------------------------------- files */

describe('checklist files', () => {
  it('ships exactly one JSON file per checklist id', () => {
    const files = readdirSync(CHECKLIST_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();
    expect(files).toEqual(EXPECTED_FILES);
  });

  it('loads every file through the module, with no file left unwired', () => {
    expect(checklists.map((checklist) => checklist.id).sort()).toEqual(EXPECTED_FILES);
  });

  it.each(EXPECTED_FILES)('%s.json content matches what the module exposes', (name) => {
    const onDisk = readChecklistFile(name) as Checklist;
    const loaded = checklists.find((checklist) => checklist.id === name);
    expect(loaded).toBeDefined();
    expect(onDisk).toEqual(loaded);
  });

  it.each(EXPECTED_FILES)('%s.json declares an id equal to its file name', (name) => {
    const onDisk = readChecklistFile(name) as Checklist;
    expect(onDisk.id).toBe(name);
  });
});

/* -------------------------------------------------------------- structure */

describe.each(EXPECTED_FILES)('%s checklist', (name) => {
  const checklist = checklists.find((entry) => entry.id === name) as Checklist;

  it('has a title and a positive integer version', () => {
    expect(checklist.title.trim().length).toBeGreaterThan(0);
    expect(Number.isInteger(checklist.version)).toBe(true);
    expect(checklist.version).toBeGreaterThanOrEqual(1);
  });

  it(`has between ${MIN_ITEMS} and ${MAX_ITEMS} items`, () => {
    expect(checklist.items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    expect(checklist.items.length).toBeLessThanOrEqual(MAX_ITEMS);
  });

  it('prefixes every item id with the checklist id and keeps them unique locally', () => {
    for (const item of checklist.items) {
      expect(item.id.startsWith(`${checklist.id}-`)).toBe(true);
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(checklist.items.map((item) => item.id)).size).toBe(checklist.items.length);
  });

  it('gives every item a concept slug, a question and a why', () => {
    for (const item of checklist.items) {
      expect(item.concept).toMatch(/^[a-z0-9-]+$/);
      expect(item.question.trim().length).toBeGreaterThan(0);
      expect(item.why.trim().length).toBeGreaterThan(0);
    }
  });

  it('asks one question per item, ending in a question mark', () => {
    for (const item of checklist.items) {
      expect(item.question.trim().endsWith('?')).toBe(true);
      // One sentence: no sentence-ending punctuation before the final mark.
      expect(item.question.slice(0, -1)).not.toMatch(/[.?!]\s/);
    }
  });

  it(`keeps every question at or under ${MAX_QUESTION_LENGTH} characters`, () => {
    for (const item of checklist.items) {
      expect(item.question.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    }
  });
});

describe('checklist set', () => {
  it('keeps item ids unique across every checklist', () => {
    const ids = allItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns a fresh array so callers cannot mutate the loaded data', () => {
    const first = allChecklists();
    first.pop();
    expect(allChecklists()).toHaveLength(EXPECTED_FILES.length);
  });
});

/* --------------------------------------------------------------- getChecklist */

describe('getChecklist', () => {
  it('resolves every study design to a checklist', () => {
    for (const design of STUDY_DESIGNS) {
      expect(getChecklist(design).items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    }
  });

  it.each(EXPECTED_FILES)('returns the %s checklist for its own id', (name) => {
    expect(getChecklist(name as StudyDesign).id).toBe(name);
  });

  it('maps non-randomized-trial onto the rct checklist (#1 B5)', () => {
    expect(getChecklist('non-randomized-trial')).toBe(getChecklist('rct'));
    expect(getChecklist('non-randomized-trial').id).toBe('rct');
  });

  it('explains the reuse in a checklist-level note on rct.json', () => {
    const note = getChecklist('rct').note;
    expect(note).toBeDefined();
    expect(note?.trim().length).toBeGreaterThan(0);
    expect(note?.toLowerCase()).toContain('non-randomized');
  });

  it('falls back to the generic checklist for an unknown design', () => {
    // Stored appraisals can carry a design string this build no longer knows.
    expect(getChecklist('something-else' as unknown as StudyDesign).id).toBe('unclear');
  });

  it('gives getChecklist("cohort") 6-10 items (issue #13 acceptance)', () => {
    expect(getChecklist('cohort').items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    expect(getChecklist('cohort').items.length).toBeLessThanOrEqual(MAX_ITEMS);
  });
});

/* --------------------------------------------------------------- verdict help */

describe('verdict help', () => {
  it('explains all three verdicts', () => {
    for (const line of [VERDICT_HELP.yes, VERDICT_HELP.no, VERDICT_HELP.unclear]) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.trim().endsWith('.')).toBe(true);
    }
  });

  it('says that Unclear means the abstract does not say', () => {
    expect(VERDICT_HELP.unclear.toLowerCase()).toContain('abstract');
  });
});

/* ------------------------------------------------------------ wording guard */

describe('original wording guard', () => {
  it('has a non-trivial comparison corpus', () => {
    expect(forbiddenPhrases.length).toBeGreaterThanOrEqual(40);
    expect(forbiddenFixture.comment.toLowerCase()).toContain('fixture');
  });

  it('never reproduces a corpus phrase exactly', () => {
    const normalizedCorpus = new Set(forbiddenPhrases.map(normalize));
    for (const item of allItems) {
      expect(normalizedCorpus.has(normalize(item.question))).toBe(false);
    }
  });

  it(`keeps every question below ${SIMILARITY_THRESHOLD} similarity to the corpus`, () => {
    const offenders = allItems
      .map((item) => ({ item, match: closestForbidden(item.question) }))
      .filter((entry) => entry.match.score >= SIMILARITY_THRESHOLD)
      .map(
        (entry) => `${entry.item.id} ~ "${entry.match.phrase}" (${entry.match.score.toFixed(2)})`,
      );
    expect(offenders).toEqual([]);
  });

  it(`keeps the worst observed similarity under ${MAX_OBSERVED_SIMILARITY}`, () => {
    const worst = allItems
      .map((item) => closestForbidden(item.question).score)
      .reduce((max, score) => Math.max(max, score), 0);
    expect(worst).toBeLessThan(MAX_OBSERVED_SIMILARITY);
  });

  it('also checks the why text for exact reproduction', () => {
    const normalizedCorpus = new Set(forbiddenPhrases.map(normalize));
    for (const item of allItems) {
      expect(normalizedCorpus.has(normalize(item.why))).toBe(false);
    }
  });

  /* The guard is only worth having if it fires. These two sentences are
     deliberate copies, defined here and never shipped. */
  it('fires on a verbatim copy', () => {
    const verbatim = 'Were the controls selected in an acceptable way?';
    expect(closestForbidden(verbatim).score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it('fires on a lightly reworded copy', () => {
    const reworded =
      'Were all of the patients who entered this trial properly accounted for at its conclusion?';
    const match = closestForbidden(reworded);
    expect(match.score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(match.phrase).toContain('properly accounted for');
  });

  it('does not fire on an independently written sentence about the same concept', () => {
    const original =
      'Can you see how many participants finished the study, and whether the losses were similar across the groups?';
    expect(closestForbidden(original).score).toBeLessThan(SIMILARITY_THRESHOLD);
  });
});
