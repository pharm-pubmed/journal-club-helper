import { describe, expect, it } from 'vitest';

import { classifyDesign } from '../../src/lib/design-classifier';
import type { DesignClassification } from '../../src/lib/design-classifier';

function classify(
  abstract: string,
  publicationTypes: string[] = [],
  title?: string,
): DesignClassification {
  return classifyDesign({ publicationTypes, abstract, title });
}

describe('classifyDesign / publication types (high confidence)', () => {
  it('maps Randomized Controlled Trial to rct', () => {
    const result = classify('We compared two treatments in adults with asthma.', [
      'Randomized Controlled Trial',
    ]);

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('high');
    expect(result.subtype).toBe('parallel');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Randomized Controlled Trial' },
    ]);
  });

  it('matches publication types case-insensitively and reports them verbatim', () => {
    const result = classify('No design wording at all in this text.', [
      'randomized controlled TRIAL',
    ]);

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'randomized controlled TRIAL' },
    ]);
  });

  it('maps Meta-Analysis to sr-ma with the meta-analysis subtype', () => {
    const result = classify('Effect estimates were combined across studies.', ['Meta-Analysis']);

    expect(result.design).toBe('sr-ma');
    expect(result.confidence).toBe('high');
    expect(result.subtype).toBe('meta-analysis');
    expect(result.evidence).toEqual([{ kind: 'publication-type', value: 'Meta-Analysis' }]);
  });

  it('maps Systematic Review without pooling wording to the systematic-review subtype', () => {
    const result = classify('Two reviewers screened records independently.', ['Systematic Review']);

    expect(result.design).toBe('sr-ma');
    expect(result.subtype).toBe('systematic-review');
    expect(result.evidence).toEqual([{ kind: 'publication-type', value: 'Systematic Review' }]);
  });

  it('keeps both sr-ma publication types, in input order', () => {
    const result = classify('Twelve trials were included.', ['Systematic Review', 'Meta-Analysis']);

    expect(result.design).toBe('sr-ma');
    expect(result.subtype).toBe('meta-analysis');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Systematic Review' },
      { kind: 'publication-type', value: 'Meta-Analysis' },
    ]);
  });

  it('drops duplicated publication types', () => {
    const result = classify('Twelve trials were included.', ['Meta-Analysis', 'meta-analysis']);

    expect(result.evidence).toEqual([{ kind: 'publication-type', value: 'Meta-Analysis' }]);
  });

  it('routes Observational Study to cohort using cohort keywords', () => {
    const result = classify('Participants in this prospective cohort were enrolled in 2019.', [
      'Observational Study',
    ]);

    expect(result.design).toBe('cohort');
    expect(result.confidence).toBe('high');
    expect(result.subtype).toBeNull();
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Observational Study' },
      { kind: 'keyword', value: 'prospective cohort' },
    ]);
  });

  it('routes Observational Study to case-control', () => {
    const result = classify('We compared 200 cases and controls from the same clinic.', [
      'Observational Study',
    ]);

    expect(result.design).toBe('case-control');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Observational Study' },
      { kind: 'keyword', value: 'cases and controls' },
    ]);
  });

  it('routes Observational Study to cross-sectional', () => {
    const result = classify('We estimated the prevalence of frailty in 900 outpatients.', [
      'Observational Study',
    ]);

    expect(result.design).toBe('cross-sectional');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Observational Study' },
      { kind: 'keyword', value: 'prevalence of' },
    ]);
  });

  it('defaults Observational Study to cohort when no keyword decides', () => {
    const result = classify('Adults treated during 2020 were described.', ['Observational Study']);

    expect(result.design).toBe('cohort');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toEqual([{ kind: 'publication-type', value: 'Observational Study' }]);
  });

  it('maps a bare Clinical Trial to non-randomized-trial', () => {
    const result = classify('Fifty patients received the new device.', ['Clinical Trial']);

    expect(result.design).toBe('non-randomized-trial');
    expect(result.confidence).toBe('high');
    expect(result.subtype).toBeNull();
    expect(result.evidence).toEqual([{ kind: 'publication-type', value: 'Clinical Trial' }]);
  });

  it('lets Randomized Controlled Trial win over Clinical Trial', () => {
    const result = classify('Fifty patients received the new device.', [
      'Clinical Trial',
      'Randomized Controlled Trial',
    ]);

    expect(result.design).toBe('rct');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Randomized Controlled Trial' },
    ]);
  });

  it('maps Validation Study plus diagnostic wording to diagnostic', () => {
    const result = classify(
      'We report the sensitivity and specificity against the reference standard.',
      ['Validation Study'],
    );

    expect(result.design).toBe('diagnostic');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Validation Study' },
      { kind: 'keyword', value: 'sensitivity and specificity' },
      { kind: 'keyword', value: 'reference standard' },
    ]);
  });

  it('maps Evaluation Study plus an index test mention to diagnostic', () => {
    const result = classify('The index test was compared in 300 samples.', ['Evaluation Study']);

    expect(result.design).toBe('diagnostic');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Evaluation Study' },
      { kind: 'keyword', value: 'index test' },
    ]);
  });

  it('falls back to keywords when a Validation Study has no diagnostic wording', () => {
    const result = classify('We followed for 12 months a prospective cohort of 500 adults.', [
      'Validation Study',
    ]);

    expect(result.design).toBe('cohort');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toEqual([
      { kind: 'keyword', value: 'followed for' },
      { kind: 'keyword', value: 'prospective cohort' },
    ]);
  });

  it('ignores publication types that carry no design information', () => {
    const result = classify('We randomly assigned 100 adults to two groups.', [
      'Journal Article',
      'Review',
    ]);

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomly assigned' }]);
  });

  it('lets the RCT publication type beat a retrospective keyword', () => {
    const result = classify('A retrospective analysis of the trial records was performed.', [
      'Randomized Controlled Trial',
    ]);

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Randomized Controlled Trial' },
    ]);
  });
});

describe('classifyDesign / keyword fallback (medium confidence)', () => {
  it('detects an rct from "randomized"', () => {
    const result = classify('Patients were randomized to drug or placebo.');

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomized' }]);
  });

  it('accepts the British spelling "randomised"', () => {
    const result = classify('Patients were randomised to one of two groups.');

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomised' }]);
  });

  it('detects an rct from "double-blind"', () => {
    const result = classify('A double-blind comparison of two doses.');

    expect(result.design).toBe('rct');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'double-blind' }]);
  });

  it('detects an rct from "placebo-controlled"', () => {
    const result = classify('A placebo-controlled study in 120 adults with migraine.');

    expect(result.design).toBe('rct');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'placebo-controlled' }]);
  });

  it('detects a cohort from "cohort study"', () => {
    const result = classify('This cohort study included 5000 nurses.');

    expect(result.design).toBe('cohort');
    expect(result.subtype).toBeNull();
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'cohort study' }]);
  });

  it('detects a cohort from "followed for"', () => {
    const result = classify('Participants were followed for five years.');

    expect(result.design).toBe('cohort');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'followed for' }]);
  });

  it('detects a case-control study', () => {
    const result = classify('A case-control study of 300 patients with sepsis.');

    expect(result.design).toBe('case-control');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'case-control' }]);
  });

  it('detects case-control from "matched controls"', () => {
    const result = classify('Each patient was compared with two matched controls.');

    expect(result.design).toBe('case-control');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'matched controls' }]);
  });

  it('detects a cross-sectional study', () => {
    const result = classify('A cross-sectional study of 1200 adults in primary care.');

    expect(result.design).toBe('cross-sectional');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'cross-sectional' }]);
  });

  it('detects cross-sectional from "survey of"', () => {
    const result = classify('A survey of 400 hospital pharmacists was conducted.');

    expect(result.design).toBe('cross-sectional');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'survey of' }]);
  });

  it('detects sr-ma from "we searched" and "pooled"', () => {
    const result = classify('We searched three databases and pooled the estimates from 14 trials.');

    expect(result.design).toBe('sr-ma');
    expect(result.confidence).toBe('medium');
    expect(result.subtype).toBe('systematic-review');
    expect(result.evidence).toEqual([
      { kind: 'keyword', value: 'We searched' },
      { kind: 'keyword', value: 'pooled' },
    ]);
  });

  it('detects sr-ma from a systematic search', () => {
    const result = classify('A systematic search of four databases was performed.');

    expect(result.design).toBe('sr-ma');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'systematic search' }]);
  });

  // An abstract can describe a systematic review without ever using the words
  // "searched" or "pooled" — the phrase itself is the strongest cue available.
  it('detects sr-ma from the phrase "systematic review" alone', () => {
    const result = classify('This systematic review summarised the evidence on statin adherence.');

    expect(result.design).toBe('sr-ma');
    expect(result.confidence).toBe('medium');
    expect(result.subtype).toBe('systematic-review');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'systematic review' }]);
  });

  it('detects sr-ma from meta-analysis wording', () => {
    const result = classify('This meta-analysis combined 12 trials of statins.');

    expect(result.design).toBe('sr-ma');
    expect(result.subtype).toBe('meta-analysis');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'meta-analysis' }]);
  });

  it('detects a network meta-analysis and reports one piece of evidence', () => {
    const result = classify('A network meta-analysis of 30 trials compared five drugs.');

    expect(result.design).toBe('sr-ma');
    expect(result.subtype).toBe('network-meta-analysis');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'network meta-analysis' }]);
  });

  it('detects a diagnostic study from "diagnostic accuracy"', () => {
    const result = classify('The diagnostic accuracy of the score was assessed in 600 patients.');

    expect(result.design).toBe('diagnostic');
    expect(result.subtype).toBeNull();
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'diagnostic accuracy' }]);
  });

  it('detects a diagnostic study from the ROC wording', () => {
    const result = classify('The area under the ROC curve was 0.82 in the validation sample.');

    expect(result.design).toBe('diagnostic');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'area under the ROC curve' }]);
  });

  it('detects a diagnostic study from AUC', () => {
    const result = classify('The AUC of the score reached 0.91.');

    expect(result.design).toBe('diagnostic');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'AUC' }]);
  });

  it('detects a non-randomized trial without being fooled by "randomized"', () => {
    const result = classify('This non-randomized study compared two clinics.');

    expect(result.design).toBe('non-randomized-trial');
    expect(result.subtype).toBeNull();
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'non-randomized' }]);
  });

  it('detects a single-arm trial', () => {
    const result = classify('A single-arm study of 40 patients receiving the new agent.');

    expect(result.design).toBe('non-randomized-trial');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'single-arm' }]);
  });

  it('reads keywords from the title as well as the abstract', () => {
    const result = classify(
      'The study ran from 2018 to 2021 at six sites.',
      [],
      'A randomised, double-blind, placebo-controlled crossover trial of drug X',
    );

    expect(result.design).toBe('rct');
    expect(result.subtype).toBe('crossover');
    expect(result.evidence).toEqual([
      { kind: 'keyword', value: 'randomised' },
      { kind: 'keyword', value: 'double-blind' },
      { kind: 'keyword', value: 'placebo-controlled' },
      { kind: 'keyword', value: 'crossover' },
    ]);
  });

  it('de-duplicates repeated keywords and keeps the first spelling', () => {
    const result = classify('Patients were randomized. Randomized allocation was concealed.');

    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomized' }]);
  });
});

describe('classifyDesign / rct subtypes', () => {
  it('detects a crossover trial', () => {
    const result = classify('Patients were randomized in a crossover design.');

    expect(result.design).toBe('rct');
    expect(result.subtype).toBe('crossover');
    expect(result.evidence).toEqual([
      { kind: 'keyword', value: 'randomized' },
      { kind: 'keyword', value: 'crossover' },
    ]);
  });

  it('detects a cluster trial', () => {
    const result = classify('Twenty clinics were randomized in this cluster trial.');

    expect(result.subtype).toBe('cluster');
  });

  it('detects a non-inferiority trial', () => {
    const result = classify('A randomized non-inferiority trial of two antibiotics.');

    expect(result.subtype).toBe('non-inferiority');
  });

  it('detects the British "noninferiority" spelling', () => {
    const result = classify('A randomised noninferiority trial of two antibiotics.');

    expect(result.subtype).toBe('non-inferiority');
  });

  it('falls back to the parallel subtype', () => {
    const result = classify('Adults were randomly assigned to drug or usual care.');

    expect(result.subtype).toBe('parallel');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomly assigned' }]);
  });
});

describe('classifyDesign / conflicts and structured abstracts', () => {
  it('prefers the earliest keyword in the Methods section', () => {
    const result = classify(
      [
        'BACKGROUND: Earlier case-control work suggested harm.',
        'METHODS: We randomly assigned 240 adults to two groups.',
        'RESULTS: The event rate was lower in the treatment group.',
      ].join('\n\n'),
    );

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomly assigned' }]);
  });

  it('handles inline all-caps section labels', () => {
    const result = classify(
      'OBJECTIVE: To revisit earlier case-control findings. METHODS: We randomly assigned 100 adults. RESULTS: No difference was seen.',
    );

    expect(result.design).toBe('rct');
  });

  it('uses the first match in the text when the abstract is unstructured', () => {
    const result = classify(
      'Earlier case-control work suggested harm, so we randomly assigned 240 adults.',
    );

    expect(result.design).toBe('case-control');
    expect(result.confidence).toBe('medium');
  });

  it('known limitation: "previous randomized trials" in the Background still yields rct', () => {
    // Documented in design-classifier.ts: the Methods section carries no design
    // keyword, so the whole-text fallback picks up the Background mention.
    const result = classify(
      [
        'BACKGROUND: Previous randomized trials were small.',
        'METHODS: We reviewed the charts of 400 adults treated at one centre.',
        'RESULTS: Mortality was 12%.',
      ].join('\n\n'),
    );

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toEqual([{ kind: 'keyword', value: 'randomized' }]);
  });
});

describe('classifyDesign / unclear', () => {
  it('returns unclear when nothing matches', () => {
    const result = classify('This paper describes a new surgical technique in three patients.');

    expect(result).toEqual({
      design: 'unclear',
      subtype: null,
      confidence: 'low',
      evidence: [],
    });
  });

  it('returns unclear for an empty abstract with no publication types', () => {
    const result = classify('');

    expect(result).toEqual({
      design: 'unclear',
      subtype: null,
      confidence: 'low',
      evidence: [],
    });
  });

  it('still classifies from the publication type when the abstract is empty', () => {
    const result = classify('', ['Randomized Controlled Trial']);

    expect(result.design).toBe('rct');
    expect(result.confidence).toBe('high');
    expect(result.subtype).toBe('parallel');
    expect(result.evidence).toEqual([
      { kind: 'publication-type', value: 'Randomized Controlled Trial' },
    ]);
  });
});
