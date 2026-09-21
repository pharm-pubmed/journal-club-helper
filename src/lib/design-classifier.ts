/**
 * Rule-based study design detection (SPEC.ja.md §4.2, issue #7).
 *
 * Pure module: no DOM, no `chrome.*`, no network. A design is decided from the
 * publication types PubMed already assigned (high confidence) and, failing that,
 * from wording in the title and abstract (medium confidence). The user can always
 * override the result in the panel, so the goal is a transparent guess plus the
 * evidence that produced it, never a silent one.
 */

import type { DesignClassification, DesignConfidence, DesignEvidence, StudyDesign } from './types';

export type { DesignClassification } from './types';

export interface ClassifyDesignInput {
  publicationTypes: string[];
  abstract: string;
  /** Titles name the design ("... : a randomised crossover trial") more often than abstracts do. */
  title?: string;
}

/* ------------------------------------------------------------ publication types */

const PT_RCT = 'randomized controlled trial';
const PT_META_ANALYSIS = 'meta-analysis';
const PT_SYSTEMATIC_REVIEW = 'systematic review';
const PT_OBSERVATIONAL = 'observational study';
const PT_CLINICAL_TRIAL = 'clinical trial';
const PT_VALIDATION = 'validation study';
const PT_EVALUATION = 'evaluation study';

/* ------------------------------------------------------------------- keywords */

interface KeywordRule {
  design: StudyDesign;
  /** Global + case-insensitive. `match[0]` is shown to the user verbatim. */
  pattern: RegExp;
}

/**
 * Two rules can only collide at the same offset when one phrase is a prefix of the
 * other, so the more specific design is listed first. "non-randomized" starts four
 * characters before the "randomized" inside it, which is why it wins on position.
 */
const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    design: 'non-randomized-trial',
    pattern: /\b(?:non-?randomi[sz]ed|single[-\s]arm)\b/gi,
  },
  {
    design: 'rct',
    pattern:
      /\b(?:randomi[sz]ed|randomly (?:assigned|allocated)|double[-\s]blind(?:ed)?|placebo[-\s]controlled)\b/gi,
  },
  {
    design: 'sr-ma',
    // "network meta-analysis" is matched whole so the evidence string stays specific
    // and the sr-ma subtype rule below de-duplicates against it.
    pattern:
      /\b(?:we searched|systematic (?:search|review)s?|pooled|(?:network[-\s])?meta[-\s]?analy[a-z]*)\b/gi,
  },
  {
    design: 'cohort',
    // SPEC §4.2 lists a bare `retrospective`, issue #7 lists `retrospective cohort`.
    // Both are accepted, the longer alternative first so the evidence stays specific.
    pattern:
      /\b(?:prospective cohort|retrospective cohort|cohort stud(?:y|ies)|followed for|retrospective)\b/gi,
  },
  {
    design: 'case-control',
    pattern: /\b(?:case[-\s]control(?:led)?|cases and controls|matched controls)\b/gi,
  },
  {
    design: 'cross-sectional',
    pattern: /\b(?:cross[-\s]sectional|survey of|prevalence of)\b/gi,
  },
  {
    design: 'diagnostic',
    pattern:
      /\b(?:sensitivity and specificity|diagnostic accuracy|area under the (?:ROC |receiver operating characteristic )?curve|AUC|reference standard|index test)\b/gi,
  },
];

const OBSERVATIONAL_DESIGNS: readonly StudyDesign[] = ['cohort', 'case-control', 'cross-sectional'];

interface SubtypeRule {
  subtype: string;
  pattern: RegExp;
}

/** Priority order comes from issue #7 rule 3; anything else is a parallel-group trial. */
const RCT_SUBTYPE_RULES: readonly SubtypeRule[] = [
  { subtype: 'crossover', pattern: /\bcross[-\s]?over\b/i },
  { subtype: 'cluster', pattern: /\bcluster\b/i },
  { subtype: 'non-inferiority', pattern: /\bnon-?inferiority\b/i },
];

const SR_MA_SUBTYPE_RULES: readonly SubtypeRule[] = [
  { subtype: 'network-meta-analysis', pattern: /\bnetwork[-\s]meta[-\s]?analy[a-z]*\b/i },
  { subtype: 'meta-analysis', pattern: /\bmeta[-\s]?analy[a-z]*\b/i },
];

interface KeywordHit {
  design: StudyDesign;
  value: string;
  start: number;
}

function findKeywordHits(text: string): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const rule of KEYWORD_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      hits.push({ design: rule.design, value: match[0], start: match.index ?? 0 });
    }
  }
  // Stable sort: equal offsets keep the KEYWORD_RULES order above.
  return hits.sort((a, b) => a.start - b.start);
}

/* --------------------------------------------------------- structured abstracts */

interface SectionRange {
  label: string;
  /** Offset of the first character of the section body, in the combined text. */
  start: number;
  end: number;
}

// A structured abstract arrives either as one labelled line per section or, when the
// page joins the sections into a paragraph, as inline all-caps labels.
const LINE_LABEL_RE = /(?:^|\n)[ \t]*([A-Za-z][A-Za-z0-9 ,/&'-]{1,48}):/g;
const INLINE_LABEL_RE = /(?:^|\s)([A-Z][A-Z0-9 ,/&'-]{2,48}):/g;
const METHODS_LABEL_RE = /\b(?:methods?|methodology|design)\b/i;

/** `offset` shifts the ranges into the combined "title + abstract" text. */
function findSections(abstract: string, offset: number): SectionRange[] {
  const labelByBodyStart = new Map<number, string>();
  for (const re of [LINE_LABEL_RE, INLINE_LABEL_RE]) {
    for (const match of abstract.matchAll(re)) {
      const bodyStart = (match.index ?? 0) + match[0].length;
      if (!labelByBodyStart.has(bodyStart)) labelByBodyStart.set(bodyStart, match[1] ?? '');
    }
  }
  const marks = [...labelByBodyStart.entries()]
    .map(([bodyStart, label]) => ({
      label,
      start: bodyStart + offset,
      // The label plus its colon sits immediately before the body.
      labelStart: bodyStart - label.length - 1 + offset,
    }))
    .sort((a, b) => a.start - b.start);

  return marks.map((mark, index) => ({
    label: mark.label,
    start: mark.start,
    end: marks[index + 1]?.labelStart ?? abstract.length + offset,
  }));
}

/**
 * Conflict rule (issue #7 rule 5): in a structured abstract the earliest keyword
 * inside a Methods-like section wins; otherwise the first keyword in the text does.
 *
 * Known limitation, not a bug: when the Methods section contains no design keyword
 * the whole-text fallback applies, so "previous randomized trials" mentioned only in
 * the Background classifies the paper as an RCT at medium confidence. That is
 * deliberate: a visible guess with its evidence on screen is easier for the user to
 * correct than a bare "unclear", and the design is user-overridable.
 */
function pickWinner(
  hits: readonly KeywordHit[],
  sections: readonly SectionRange[],
): KeywordHit | undefined {
  if (sections.length >= 2) {
    const methods = sections.filter((section) => METHODS_LABEL_RE.test(section.label));
    const inMethods = hits.find((hit) =>
      methods.some((section) => hit.start >= section.start && hit.start < section.end),
    );
    if (inMethods) return inMethods;
  }
  return hits[0];
}

/* ------------------------------------------------------------------- evidence */

function dedupeEvidence(evidence: readonly DesignEvidence[]): DesignEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.kind} ${item.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every keyword that fired for the winning design, in order of first appearance. */
function keywordEvidence(hits: readonly KeywordHit[], design: StudyDesign): DesignEvidence[] {
  return dedupeEvidence(
    hits
      .filter((hit) => hit.design === design)
      .map((hit) => ({ kind: 'keyword' as const, value: hit.value })),
  );
}

/* ------------------------------------------------------------------ classifying */

interface TypeMatch {
  design: StudyDesign;
  evidence: DesignEvidence[];
}

function classifyByPublicationType(
  publicationTypes: readonly string[],
  hits: readonly KeywordHit[],
  sections: readonly SectionRange[],
): TypeMatch | null {
  /** Exact, case-insensitive match; the user-facing value keeps the source spelling. */
  const pick = (...names: string[]): DesignEvidence[] => {
    const wanted = new Set(names);
    const seen = new Set<string>();
    const found: DesignEvidence[] = [];
    for (const raw of publicationTypes) {
      const key = raw.trim().toLowerCase();
      if (!wanted.has(key) || seen.has(key)) continue;
      seen.add(key);
      found.push({ kind: 'publication-type', value: raw.trim() });
    }
    return found;
  };

  const rct = pick(PT_RCT);
  if (rct.length > 0) return { design: 'rct', evidence: rct };

  const review = pick(PT_META_ANALYSIS, PT_SYSTEMATIC_REVIEW);
  if (review.length > 0) return { design: 'sr-ma', evidence: review };

  const observational = pick(PT_OBSERVATIONAL);
  if (observational.length > 0) {
    const decided = pickWinner(
      hits.filter((hit) => OBSERVATIONAL_DESIGNS.includes(hit.design)),
      sections,
    );
    const design = decided?.design ?? 'cohort';
    return { design, evidence: [...observational, ...keywordEvidence(hits, design)] };
  }

  const clinicalTrial = pick(PT_CLINICAL_TRIAL);
  if (clinicalTrial.length > 0) {
    return { design: 'non-randomized-trial', evidence: clinicalTrial };
  }

  const validation = pick(PT_VALIDATION, PT_EVALUATION);
  if (validation.length > 0) {
    // These types also cover method papers, so they only mean "diagnostic accuracy
    // study" when the abstract talks like one.
    const diagnostic = keywordEvidence(hits, 'diagnostic');
    if (diagnostic.length > 0) {
      return { design: 'diagnostic', evidence: [...validation, ...diagnostic] };
    }
  }

  return null;
}

function resolveSubtype(
  design: StudyDesign,
  text: string,
  publicationTypes: readonly string[],
): { subtype: string | null; extra: DesignEvidence[] } {
  if (design === 'rct') {
    for (const rule of RCT_SUBTYPE_RULES) {
      const match = rule.pattern.exec(text);
      if (match) return { subtype: rule.subtype, extra: [{ kind: 'keyword', value: match[0] }] };
    }
    return { subtype: 'parallel', extra: [] };
  }

  if (design === 'sr-ma') {
    for (const rule of SR_MA_SUBTYPE_RULES) {
      const match = rule.pattern.exec(text);
      if (match) return { subtype: rule.subtype, extra: [{ kind: 'keyword', value: match[0] }] };
    }
    const pooled = publicationTypes.some((type) => type.trim().toLowerCase() === PT_META_ANALYSIS);
    return { subtype: pooled ? 'meta-analysis' : 'systematic-review', extra: [] };
  }

  return { subtype: null, extra: [] };
}

function finish(
  design: StudyDesign,
  confidence: DesignConfidence,
  evidence: DesignEvidence[],
  text: string,
  publicationTypes: readonly string[],
): DesignClassification {
  const { subtype, extra } = resolveSubtype(design, text, publicationTypes);
  return { design, subtype, confidence, evidence: dedupeEvidence([...evidence, ...extra]) };
}

export function classifyDesign(input: ClassifyDesignInput): DesignClassification {
  const title = input.title ?? '';
  const text = title.length > 0 ? `${title}\n\n${input.abstract}` : input.abstract;
  const hits = findKeywordHits(text);
  // Only the abstract is structured; the title is just a prefix of the combined text.
  const sections = findSections(input.abstract, text.length - input.abstract.length);

  const fromType = classifyByPublicationType(input.publicationTypes, hits, sections);
  if (fromType) {
    return finish(fromType.design, 'high', fromType.evidence, text, input.publicationTypes);
  }

  const winner = pickWinner(hits, sections);
  if (winner) {
    return finish(
      winner.design,
      'medium',
      keywordEvidence(hits, winner.design),
      text,
      input.publicationTypes,
    );
  }

  return { design: 'unclear', subtype: null, confidence: 'low', evidence: [] };
}
