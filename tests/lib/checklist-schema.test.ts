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
 *
 * Both jobs cover everything a reader can actually see: the general items, the
 * items inside subtype-specific groups, and the non-scored info panels.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  VERDICT_HELP,
  allChecklists,
  getChecklist,
  visibleItems,
  type Checklist,
  type ChecklistItem,
  type ChecklistSection,
  type EvidenceNeed,
  type InfoPanel,
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

/** The runtime domain of `ChecklistSection`; JSON can hold anything, so it is checked. */
const SECTIONS: readonly ChecklistSection[] = ['internal-validity', 'applicability'];

/** The runtime domain of `EvidenceNeed`, which is what drives the Unclear explanation. */
const NEEDS: readonly EvidenceNeed[] = ['abstract', 'full-text', 'protocol-or-registry'];

/**
 * Jaccard similarity over word sets, at or above which the build flags a
 * question for excessive overlap with the comparison corpus.
 *
 * 0.5 means the two sentences share half of their combined vocabulary. A
 * verbatim copy scores 1.0 and a reworded copy — the same sentence with a word
 * or two swapped — scores 0.93; both self-tests are at the bottom of this file.
 * Staying under this number means only that this metric found no pair at or
 * above the threshold in this corpus. It proves neither originality nor the
 * absence of copying. REVIEWED_EXCEPTIONS records reasons for accepting flagged
 * pairs; the tests cannot establish who wrote them or whether a human reviewed
 * them. Those questions remain part of code review.
 */
const SIMILARITY_THRESHOLD = 0.5;

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

/** The info panels a checklist ships, as a list so a checklist without one is not special-cased. */
function infoPanels(checklist: Checklist): InfoPanel[] {
  return checklist.info ? [checklist.info] : [];
}

const checklists = allChecklists();

/** Everything a reader sees: general items plus every group's items, from every checklist. */
const allItems: ChecklistItem[] = checklists.flatMap((checklist) => visibleItems(checklist));
const allPanels: InfoPanel[] = checklists.flatMap((checklist) => infoPanels(checklist));

/** Every question-shaped string that ships, including the non-scored info prompts. */
const allQuestions: { id: string; text: string }[] = [
  ...allItems.map((item) => ({ id: item.id, text: item.question })),
  ...allPanels.map((panel) => ({ id: `info:${panel.id}`, text: panel.prompt })),
];

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
  /** Group items are shown alongside the general ones, so they obey the same rules. */
  const items = visibleItems(checklist);
  const groups = checklist.groups ?? [];

  it('has a title and a positive integer version', () => {
    expect(checklist.title.trim().length).toBeGreaterThan(0);
    expect(Number.isInteger(checklist.version)).toBe(true);
    expect(checklist.version).toBeGreaterThanOrEqual(1);
  });

  it(`has between ${MIN_ITEMS} and ${MAX_ITEMS} general items`, () => {
    expect(checklist.items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    expect(checklist.items.length).toBeLessThanOrEqual(MAX_ITEMS);
  });

  it('prefixes every item id with the checklist id and keeps them unique across the checklist', () => {
    for (const item of items) {
      expect(item.id.startsWith(`${checklist.id}-`)).toBe(true);
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
    }
    // Group items share the answer map with the general items, so a collision
    // would silently make two questions write to the same stored answer.
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('gives every item a concept slug, a question and a why', () => {
    for (const item of items) {
      expect(item.concept).toMatch(/^[a-z0-9-]+$/);
      expect(item.question.trim().length).toBeGreaterThan(0);
      expect(item.why.trim().length).toBeGreaterThan(0);
    }
  });

  it('asks one question per item, ending in a question mark', () => {
    for (const item of items) {
      expect(item.question.trim().endsWith('?')).toBe(true);
      // One sentence: no sentence-ending punctuation before the final mark.
      expect(item.question.slice(0, -1)).not.toMatch(/[.?!]\s/);
    }
  });

  it(`keeps every question at or under ${MAX_QUESTION_LENGTH} characters`, () => {
    for (const item of items) {
      expect(item.question.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    }
  });

  it('puts every item in a real section, with at least one internal-validity item', () => {
    for (const item of items) {
      expect(SECTIONS).toContain(item.section);
    }
    expect(items.some((item) => item.section === 'internal-validity')).toBe(true);
  });

  it('declares the weakest source that can answer each item', () => {
    for (const item of items) {
      expect(NEEDS).toContain(item.needs);
    }
  });

  it('gives every item a non-empty list of concrete things to look for', () => {
    for (const item of items) {
      expect(Array.isArray(item.lookFor)).toBe(true);
      expect(item.lookFor.length).toBeGreaterThan(0);
      for (const hint of item.lookFor) {
        expect(typeof hint).toBe('string');
        expect(hint.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('describes every subtype group it ships, with items of its own', () => {
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
    for (const group of groups) {
      expect(group.id).toMatch(/^[a-z0-9-]+$/);
      expect(group.title.trim().length).toBeGreaterThan(0);
      expect(group.subtypes.length).toBeGreaterThan(0);
      for (const subtype of group.subtypes) {
        expect(subtype.trim().length).toBeGreaterThan(0);
      }
      expect(group.items.length).toBeGreaterThan(0);
      if (group.note !== undefined) expect(group.note.trim().length).toBeGreaterThan(0);
    }
  });

  it('records info panels as facts, never as scored items', () => {
    for (const panel of infoPanels(checklist)) {
      expect(panel.id).toMatch(/^[a-z0-9-]+$/);
      expect(panel.title.trim().length).toBeGreaterThan(0);
      expect(panel.prompt.trim().length).toBeGreaterThan(0);
      expect(panel.why.trim().length).toBeGreaterThan(0);
      expect(panel.fields.length).toBeGreaterThan(0);
      for (const field of panel.fields) {
        expect(field.id).toMatch(/^[a-z0-9-]+$/);
        expect(field.label.trim().length).toBeGreaterThan(0);
        if (field.hint !== undefined) expect(field.hint.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(panel.fields.map((field) => field.id)).size).toBe(panel.fields.length);
      // An info panel has no verdict, so it must not look like an item.
      expect(items.some((item) => item.id === panel.id)).toBe(false);
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

  /**
   * The rule from the appraisal brief, made executable: a question is about the
   * study's methods, never about what an abstract happens to mention. "Not
   * reported" is Unclear, and which document would settle it is carried by
   * `needs`, not by the wording of the question.
   */
  it('never asks what the abstract says', () => {
    const offenders = allQuestions
      .filter((entry) => entry.text.toLowerCase().includes('the abstract'))
      .map((entry) => `${entry.id}: ${entry.text}`);
    expect(offenders).toEqual([]);
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
    // Value equality, not identity: subtype filtering builds a fresh object.
    expect(getChecklist('non-randomized-trial')).toEqual(getChecklist('rct'));
    expect(getChecklist('non-randomized-trial').id).toBe('rct');
    expect(getChecklist('non-randomized-trial').items).toEqual(getChecklist('rct').items);
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

/* ------------------------------------------------------- subtype-specific groups */

describe('subtype groups', () => {
  it('adds the non-inferiority group for a non-inferiority trial', () => {
    const checklist = getChecklist('rct', 'non-inferiority');
    expect(checklist.groups?.map((group) => group.id)).toEqual(['rct-non-inferiority']);
    const group = checklist.groups?.[0];
    expect(group?.items.length).toBeGreaterThan(0);
    // Added to the general items, never a replacement for them.
    expect(checklist.items).toEqual(getChecklist('rct').items);
    expect(visibleItems(checklist).length).toBe(
      checklist.items.length + (group?.items.length ?? 0),
    );
  });

  it('says in the group note that these checks are in addition to the general items', () => {
    const group = getChecklist('rct', 'non-inferiority').groups?.[0];
    expect(group?.note).toBeDefined();
    expect(group?.note?.trim().length).toBeGreaterThan(0);
  });

  it('hides the group when no subtype is known', () => {
    expect(getChecklist('rct', null).groups).toBeUndefined();
    expect(getChecklist('rct').groups).toBeUndefined();
    expect(visibleItems(getChecklist('rct', null))).toEqual(getChecklist('rct').items);
  });

  it('hides the group for a different subtype', () => {
    expect(getChecklist('rct', 'parallel').groups).toBeUndefined();
    expect(getChecklist('rct', 'crossover').groups).toBeUndefined();
    expect(visibleItems(getChecklist('rct', 'parallel'))).toEqual(getChecklist('rct').items);
  });

  it('keeps every group subtype reachable from the checklist that declares it', () => {
    for (const checklist of checklists) {
      for (const group of checklist.groups ?? []) {
        for (const subtype of group.subtypes) {
          const resolved = getChecklist(checklist.id, subtype);
          expect(resolved.groups?.map((entry) => entry.id)).toContain(group.id);
        }
      }
    }
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

/**
 * Similarity at or above which a (question, corpus phrase) pair has to be read
 * and written up in REVIEWED_EXCEPTIONS below.
 *
 * Measured, not guessed. Across the 73 question-shaped strings this build ships
 * (66 items plus the funding panel carried by each of the 7 checklists) and the
 * 63-entry corpus, the scores fall into two groups. Everything except one pair
 * sits at 0.250 or below; the top of that group is the funding panel against
 * "have they taken account of the confounding factors in the design and
 * analysis" and cohort-outcome-measurement against "were the outcomes measured
 * in a valid and reliable way", both 0.250. Then there is an empty band up to
 * the single pair at 0.333 that REVIEWED_EXCEPTIONS covers. 0.30 sits inside
 * that band for the current corpus. Even small wording edits can move a pair
 * across the bar; the stale-entry check makes dropping a listed pair below it
 * visible but does not establish that the meaning has changed.
 *
 * Raising this number is not a way to deal with a question that trips it. There
 * are two ways out: review the pair and record why it is acceptable, or reword
 * the question. Raising it does not even work quietly: every entry below the new
 * bar immediately becomes stale, so the change can only be made by deleting
 * somebody's written review, in the same diff, where it can be argued with.
 */
const REVIEW_BAR = 0.3;

/**
 * How far a recorded score may sit from the score measured now.
 *
 * This allows rounding in the recorded score. It is not a detector for every
 * wording change: edits can preserve the word set or the score. Reviewers must
 * still check whether the reason applies to the current sentences.
 */
const SCORE_DRIFT_TOLERANCE = 0.01;

/**
 * A reason is an argument about two specific sentences, which does not fit in a
 * few words. This length is a floor against an empty gesture, not a target.
 */
const MIN_REASON_LENGTH = 120;

/** One pair of shipped question and corpus phrase with a recorded rationale. */
interface ReviewedException {
  /** The item id, or `info:<panel id>` for a non-scored panel prompt. */
  readonly id: string;
  /** The corpus entry it approached, copied exactly from the fixture. */
  readonly phrase: string;
  /** The similarity measured when the pair was reviewed. */
  readonly score: number;
  /** Why the overlap is the vocabulary of the concept and not reused wording. */
  readonly reason: string;
}

/**
 * Recorded decisions for pairs requiring review. Reasons are arguments for a
 * reviewer to assess, not proof of originality or of human approval. Adding a
 * pair above the bar without a reason fails, as does retaining an entry whose
 * pair no longer reaches the bar.
 *
 * What does not belong here: a pair that is genuinely close wording. The fix
 * for that is to rewrite the question.
 */
const REVIEWED_EXCEPTIONS: readonly ReviewedException[] = [
  {
    id: 'rct-randomisation-sequence',
    phrase: 'method used to generate the random allocation sequence',
    score: 0.333,
    reason:
      'Rationale recorded 2026-09-21. The five words the two sentences share — the, random, ' +
      'allocation, sequence, method — are the name of the thing being asked about rather ' +
      'than a borrowed phrase: "allocation sequence" is the standard term for the list of ' +
      'assignments, "random" is the property under examination, and "method" is the ordinary ' +
      'noun for how something was produced. Nothing else is shared. The corpus entry is a ' +
      'noun phrase instructing authors to report a method; the shipped line is a question ' +
      'asking a reader to judge one, and the judgement it carries — "genuinely random and ' +
      'unpredictable" — has no counterpart in the corpus entry. The longest run of ' +
      'consecutive words the two have in common is the two-word term of art itself. The ' +
      'score is as high as it is mostly because the corpus entry is only eight words long, ' +
      'which keeps the union small: 5 shared words over a union of 15. Naming the concept in ' +
      'plainer words would score lower and cost the reader clarity, which is not a trade ' +
      'worth making. Counterargument: this overlap is avoidable. For example, ' +
      '"Was the order of assignment produced by an unpredictable chance process nobody ' +
      'could foresee?" scores approximately 0.048 against this corpus phrase. Retaining ' +
      'the standard clinical terminology is a judgement about clarity, not a fact that ' +
      'the overlap is necessary; a reviewer can disagree with that judgement.',
  },
];

/** One scored (question, corpus phrase) pair. */
interface ScoredPair {
  id: string;
  phrase: string;
  score: number;
}

/** Stable identity of a pair, used to match the measured pairs against the list. */
function pairKey(id: string, phrase: string): string {
  return `${id} ~ ${phrase}`;
}

function describePair(pair: ScoredPair): string {
  return `${pair.id} ~ "${pair.phrase}" (${pair.score.toFixed(3)})`;
}

/**
 * Every pair scoring at or above `minimum`, worst first.
 *
 * Every corpus phrase is compared, not only the closest one, so a question that
 * brushes against two instruments owes a review for each of them.
 */
function pairsAtOrAbove(minimum: number): ScoredPair[] {
  const worst = new Map<string, ScoredPair>();
  for (const entry of allQuestions) {
    const target = words(entry.text);
    for (const phrase of forbiddenPhrases) {
      const score = jaccard(target, words(phrase));
      if (score < minimum) continue;
      // The funding panel ships on every checklist, so the same pair is reached
      // more than once; one review covers it, recorded at its worst score.
      const key = pairKey(entry.id, phrase);
      const seen = worst.get(key);
      if (seen === undefined || score > seen.score) {
        worst.set(key, { id: entry.id, phrase, score });
      }
    }
  }
  return [...worst.values()].sort((a, b) => b.score - a.score);
}

/** The score a listed pair reaches now, or null when that pair no longer exists. */
function currentScore(id: string, phrase: string): number | null {
  if (!forbiddenPhrases.includes(phrase)) return null;
  const matching = allQuestions.filter((entry) => entry.id === id);
  if (matching.length === 0) return null;
  const target = words(phrase);
  return matching.reduce((max, entry) => Math.max(max, jaccard(words(entry.text), target)), 0);
}

describe('original wording guard', () => {
  it('has a non-trivial comparison corpus', () => {
    expect(forbiddenPhrases.length).toBeGreaterThanOrEqual(40);
    expect(forbiddenFixture.comment.toLowerCase()).toContain('fixture');
  });

  it('never reproduces a corpus phrase exactly', () => {
    const normalizedCorpus = new Set(forbiddenPhrases.map(normalize));
    for (const entry of allQuestions) {
      expect(normalizedCorpus.has(normalize(entry.text))).toBe(false);
    }
  });

  it(`keeps every question below ${SIMILARITY_THRESHOLD} similarity to the corpus`, () => {
    expect(pairsAtOrAbove(SIMILARITY_THRESHOLD).map(describePair)).toEqual([]);
  });

  /**
   * Check that flagged pairs have a recorded rationale. This checks coverage of
   * the list, not the authorship or correctness of the reasons.
   */
  it(`has a written review for every pair at or above ${REVIEW_BAR}`, () => {
    const reviewed = new Set(REVIEWED_EXCEPTIONS.map((entry) => pairKey(entry.id, entry.phrase)));
    const unreviewed = pairsAtOrAbove(REVIEW_BAR)
      .filter((pair) => !reviewed.has(pairKey(pair.id, pair.phrase)))
      .map(describePair);
    expect(unreviewed).toEqual([]);
  });

  /** An excuse for wording that no longer exists is worse than no excuse. */
  it('carries no stale entry in the reviewed list', () => {
    const stale = REVIEWED_EXCEPTIONS.flatMap((entry) => {
      const score = currentScore(entry.id, entry.phrase);
      if (score === null) {
        return [`${pairKey(entry.id, entry.phrase)}: that question or phrase no longer exists`];
      }
      if (score < REVIEW_BAR) {
        return [
          `${pairKey(entry.id, entry.phrase)}: now scores ${score.toFixed(3)}, under the ` +
            `${REVIEW_BAR} bar — delete the entry`,
        ];
      }
      return [];
    });
    expect(stale).toEqual([]);
  });

  /** Score drift prompts another review; an unchanged score does not establish unchanged wording. */
  it('records the score each reviewed pair was cleared at', () => {
    const drifted = REVIEWED_EXCEPTIONS.flatMap((entry) => {
      const score = currentScore(entry.id, entry.phrase);
      if (score === null || Math.abs(score - entry.score) <= SCORE_DRIFT_TOLERANCE) return [];
      return [
        `${pairKey(entry.id, entry.phrase)}: recorded ${entry.score}, now ${score.toFixed(3)} ` +
          '— re-read the pair and rewrite the reason',
      ];
    });
    expect(drifted).toEqual([]);
  });

  it('gives every reviewed pair one entry and a non-placeholder rationale', () => {
    const keys = REVIEWED_EXCEPTIONS.map((entry) => pairKey(entry.id, entry.phrase));
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of REVIEWED_EXCEPTIONS) {
      expect(entry.reason.trim().length).toBeGreaterThanOrEqual(MIN_REASON_LENGTH);
      expect(entry.reason).not.toMatch(/\b(todo|tbd|fixme|n\/a)\b/i);
      // A recorded rationale does not bypass the upper similarity threshold.
      expect(entry.score).toBeLessThan(SIMILARITY_THRESHOLD);
    }
  });

  it('also checks the why text for exact reproduction', () => {
    const normalizedCorpus = new Set(forbiddenPhrases.map(normalize));
    for (const item of allItems) {
      expect(normalizedCorpus.has(normalize(item.why))).toBe(false);
    }
    for (const panel of allPanels) {
      expect(normalizedCorpus.has(normalize(panel.why))).toBe(false);
    }
  });

  it('also checks the look-for hints for exact reproduction', () => {
    const normalizedCorpus = new Set(forbiddenPhrases.map(normalize));
    for (const item of allItems) {
      for (const hint of item.lookFor) {
        expect(normalizedCorpus.has(normalize(hint))).toBe(false);
      }
    }
  });

  it('never names a published appraisal instrument in shipped text', () => {
    // Spec §9: the concepts are common knowledge, the instruments are not ours to cite.
    const banned = /\b(casp|jbi|consort|strobe|prisma|quadas|robins|rob ?2|amstar|robis)\b/i;
    const shipped = [
      ...allItems.flatMap((item) => [item.question, item.why, ...item.lookFor]),
      ...allPanels.flatMap((panel) => [panel.prompt, panel.why]),
      ...checklists.flatMap((checklist) => [
        checklist.title,
        checklist.note ?? '',
        ...(checklist.groups ?? []).flatMap((group) => [group.title, group.note ?? '']),
      ]),
    ];
    const offenders = shipped.filter((text) => banned.test(text));
    expect(offenders).toEqual([]);
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
