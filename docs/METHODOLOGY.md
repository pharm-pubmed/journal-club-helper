# Methodology

How Journal Club Helper decides what to ask about a paper, what its answers mean,
and — just as importantly — what it refuses to conclude.

This document is written for two readers: a clinician who wants to know whether
the tool's questions are defensible, and a technical reviewer doing diligence on
the product. It assumes you already know the appraisal instruments. Where our
choices differ from theirs, the difference is stated rather than glossed.

---

## 1. What this tool is, and what it is not

Journal Club Helper is an **educational appraisal aid**. It gives a reader a
structured set of methodological questions appropriate to the study design in
front of them, records the reader's own answers, and assembles those answers into
a one-page summary for discussion.

It does not:

- summarise or paraphrase the paper (`docs/SPEC.ja.md` §2, non-goals);
- parse full-text PDFs;
- produce a clinical recommendation of any kind;
- compute an overall risk-of-bias rating, a domain-level judgement, or a score.

**Every verdict in an appraisal is entered by the user.** The tool detects the
design, offers the questions, and does arithmetic on numbers the user confirms.
Nothing is auto-filled with a judgement (`docs/SPEC.ja.md` §4.4, §9). The v0.2 AI
features, when they arrive, propose candidates that remain candidates until the
user accepts them (§4.7), under the constraints in
`src/prompts/appraisal-guardrails.md`.

One consequence is worth stating plainly, because it protects both the user and
us: **the output of this tool is not a RoB 2, ROBINS-I, QUADAS-2, ROBIS or
AMSTAR 2 assessment, and must not be reported as one.** Those instruments have
defined domains, defined algorithms and defined reporting conventions; using them
properly means using them, not using a product inspired by them. What this tool
produces is a documented reading by a named person, which is what a journal club
actually needs.

---

## 2. What the checklists are grounded in

Each design's checklist is built from the _concepts_ that the established
instruments are organised around. None of the wording is taken from them.

| Checklist (`Checklist.id`)                  | Concepts drawn from                                                                      | Note                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rct`, `non-randomized-trial`               | Cochrane RoB 2                                                                           | Randomisation process, deviations from intended intervention, missing outcome data, outcome measurement, selective reporting of the result |
| `rct` with subtype `non-inferiority`        | Piaggio et al., CONSORT extension for non-inferiority and equivalence trials (JAMA 2012) | Added as a `ChecklistGroup`, never as a replacement                                                                                        |
| `cohort`, `case-control`, `cross-sectional` | ROBINS-I                                                                                 | Confounding, participant selection, intervention/exposure classification, post-baseline deviations, missing data, outcome measurement      |
| `diagnostic`                                | QUADAS-2                                                                                 | Patient selection, index test, reference standard, flow and timing — with applicability kept separate from bias                            |
| `sr-ma`                                     | ROBIS and AMSTAR 2                                                                       | Eligibility criteria, search, selection and extraction, synthesis; plus whether a protocol pre-dated the review                            |
| `unclear`                                   | The common core of the above                                                             | Shown when the design cannot be classified; deliberately generic                                                                           |

CONSORT 2025 informs _what a well-reported trial contains_, and therefore what an
item's `lookFor` hints point the reader at. It does not supply a single
appraisal question. Section 3 explains why that distinction is load-bearing.

### Why every sentence is original

Methods are not ownable; sentences are. The concepts above — concealment,
blinding, attrition, confounding, verification bias, publication bias — are
common property of clinical epidemiology, and using them is neither a legal nor
an ethical problem. Reproducing an instrument's phrasing is a different act.

- **Legal.** The instruments are published works under their publishers' terms.
  CASP's checklists, the obvious thing an amateur would have copied, are licensed
  for non-commercial use only, which rules them out for a product that intends to
  charge (`docs/SPEC.ja.md` §9).
- **Commercial.** The 55 checklist questions and their help text _are_ the
  product. A buyer's diligence that finds copied text finds an encumbrance on the
  one asset being sold, and there is no clean remedy short of rewriting the thing
  under time pressure. Original wording from day one is cheaper than original
  wording later (`docs/SPEC.ja.md` §10).

Where an instrument is named in the UI or in an export, it is named as an
acknowledgement of the underlying concept, never as a claim of conformance.

---

## 3. Reporting completeness is not risk of bias

This is the single most common error in amateur appraisal, and avoiding it is the
main reason the tool's data model looks the way it does.

CONSORT and its extensions are **reporting guidelines**. They tell authors what
to write down so that a reader can evaluate the trial. RoB 2, ROBINS-I and
QUADAS-2 ask a different question: what was actually done, and what does that do
to the result. A trial can be conducted impeccably and reported badly. A trial
can be reported to the letter and still be unusable.

So a paper that does not mention allocation concealment has not thereby
demonstrated a failure of allocation concealment. It has demonstrated a word
limit. Abstracts in particular are 250–350 words carrying a design, a population,
an intervention, a primary endpoint, a result and a conclusion; the methods that
matter most to bias are exactly the ones that get cut first.

### How the tool is built to avoid the confusion

**Questions are about methods, not about text.** No item is phrased as "does the
abstract tell you...". `ChecklistItem.question` asks what the study did. The
reader's inability to answer it is recorded as an inability to answer it, not as
a property of the study.

**Every item declares the weakest source that can usually answer it.**
`ChecklistItem.needs` is an `EvidenceNeed`: `abstract`, `full-text`, or
`protocol-or-registry`. Allocation concealment is almost never in an abstract, so
its item is marked `full-text`; whether the primary endpoint was changed after
the trial began is `protocol-or-registry`. The UI can then explain an Unclear
instead of leaving it looking like a gap in the reader's attention.

**Every answer carries the source it came from.** An appraisal has a default
`Appraisal.sourceScope` (`SourceScope`: `abstract`, `full-text`, `supplement`,
`protocol`, `registry`, `other`), and any single answer may override it via
`ItemAnswer.source`. An assessment made from an abstract says so, everywhere it
is read.

**Not reported is Unclear, never No.** This is a hard rule, applied in the
checklist wording, in the UI's verdict help, and in the AI guardrails.

### The counterweight, stated honestly

A technical reviewer will notice that this rule can be pushed too far, so the
tool does not pretend otherwise.

Unclear is not a clean bill of health. Empirically, trials that do not describe
concealment or blinding tend to report larger effects than those that do — which
is part of why the instruments treat missing information as a concern rather than
as neutral. What our rule asserts is narrower and defensible: **absence of
reporting tells you about your own evidence base, not about the study's conduct**,
and the honest response is to name the document that would settle it rather than
to convict the paper in its absence. An appraisal full of Unclears is a real
finding about how much you can currently claim, and the export says so.

---

## 4. Three verdicts, and why Unclear is not a non-answer

`Verdict` is `'yes' | 'no' | 'unclear'`.

- **Yes** — there is positive evidence, in the source you are working from, that
  the study handled this point adequately.
- **No** — there is positive evidence that it did not, or that it handled it in a
  way that weakens the result. No requires evidence, the same as Yes does.
- **Unclear** — the source in hand does not settle it.

Unclear carries information in three distinct ways.

**It separates two situations that look identical in a binary scheme.** "We
looked, and the method was inadequate" and "we cannot tell from what we have" are
different claims with different consequences, and collapsing them turns every
under-reported trial into a bad trial.

**It is addressed to a document, not to the paper.** Paired with
`ChecklistItem.needs`, an Unclear names what would resolve it: read the methods
section, or pull the registry entry. That makes it a task rather than a shrug,
and it is the single most useful thing a resident can take out of a journal club
preparation session.

**It is the honest state of an abstract-only appraisal.** For several items on
every checklist, Unclear is the _correct_ answer from an abstract, and a tool
that made the reader feel wrong for recording it would be teaching them to guess.

### How this maps onto the instruments

We are at a deliberately different granularity from the instruments, and it is
worth being precise about it because the vocabulary overlaps.

RoB 2's domain-level judgements are Low risk, Some concerns and High risk; it
does not carry an "unclear" domain judgement. It does, however, allow the
individual signalling questions to be answered with no information available, and
that answer feeds the domain algorithm. ROBINS-I and QUADAS-2 both retain an
explicit no-information judgement of their own.

**Our Unclear is at the signalling-question level, not the domain level.** It
records what a reader could establish about one specific methodological question.
The tool does not aggregate item answers into a domain judgement, does not run
any instrument's algorithm, and does not emit an overall rating. That is a
limitation, stated as one — but it is also why the item-level Unclear is coherent
rather than a mistranslation of a domain category.

RoB 2 also assesses a specific _result_ rather than a whole trial, and
distinguishes the effect of assignment from the effect of adherence. Section 6
picks that up, because it is exactly the discipline that keeps a non-inferiority
conclusion attached to the endpoint it was tested on.

---

## 5. Internal validity, applicability and funding are three different questions

`ChecklistSection` is `'internal-validity' | 'applicability'`. Funding is not a
checklist item at all: it lives in the checklist's `InfoPanel` as one or more
`InfoField`s, written into `Appraisal.info` as free text, and it is never scored.

Three things go wrong when these are collapsed, and each of them is something you
can watch happen in a real journal club.

**A well-conducted trial that does not apply to your patient.** Concealed
allocation, blinded outcome assessment, almost no attrition, a pre-registered
primary endpoint — and a population ten years younger than your patient, with
none of her comorbidities, on a comparator nobody in your hospital uses. Every
internal-validity item is Yes. The result still does not transfer. If
applicability is folded into the same list, the aggregate looks reassuring and
the actual problem never surfaces.

**A perfectly applicable trial you cannot trust.** Exactly your patients, your
comparator, your outcome — and unconcealed allocation with a subjective endpoint
assessed by unblinded investigators. Relevance is not evidence. Folding the two
together lets a high applicability score launder a weak study.

**Industry funding treated as a verdict.** Recording a sponsor is not the same as
recording a bias. Sponsorship is associated with favourable results, but it acts
_through_ mechanisms the bias domains already ask about: comparator and dose
selection, endpoint choice, analysis-set definition, selective reporting of
results, and control of the decision to publish. Scoring funding as an item both
double-counts those domains and pre-judges the trial on its cover page. Recording
it as a fact keeps it in front of the reader — where it belongs, because it is
exactly the right prompt to go and check the pre-registered endpoints — without
pretending it is a finding.

QUADAS-2 is the clearest precedent for the first split: it asks about risk of
bias and about applicability separately for the same domain, precisely so that a
study can be flagged as sound but irrelevant. We apply the same separation across
every design.

---

## 6. Distinctions the tool refuses to collapse

Each of these has its own item or its own wording somewhere in
`src/data/checklists/`, and each exists because merging it with its neighbour is
a mistake a reader will otherwise make.

**Sequence generation is not allocation concealment.** Generating an
unpredictable order is a statistical act; keeping the next assignment unknowable
to whoever is enrolling the patient is an operational one. A perfect
computer-generated sequence handed out in a numbered list on a clipboard is not
concealed, and the resulting selection bias operates before randomisation can
protect anything. "Centralised web-based randomisation" tends to answer both at
once; "randomly assigned" answers neither.

**Blinding is not the bias it exists to prevent.** Blinding is a mechanism;
performance and detection bias are the harms. Whether the absence of blinding
matters depends on what the outcome was and on who was unblinded. All-cause
mortality ascertained from a registry is close to immune. A symptom score the
participant reports, a clinician's judgement of recovery, or a decision to
withdraw care is not. The right question is never "was it blinded" alone, but
"could knowing the assignment have moved _this_ outcome, and who would have had
to know".

**Baseline p-values are a statistical error, not a quality check.** In a
randomised trial, a significance test on a baseline characteristic tests a
hypothesis that is true by construction: the groups were assigned by chance, so
any difference is a chance difference, and a small p-value is the expected
occasional false positive rather than evidence of a failed randomisation. A table
of baseline p-values tells you nothing about randomisation quality. What matters
is the _magnitude_ of any imbalance in a strongly prognostic variable, and
whether adjustment for it was pre-specified rather than chosen after the fact. (A
distinct and much rarer use of baseline statistics — checking whether reported
balance is too good to have arisen by chance, as a fraud signal — is not what
anyone is doing when they scan that column, and is not something this tool
attempts.)

**An analysis-set label is not the analysis.** "Intention to treat" in a paper
may mean every randomised participant analysed as assigned, or it may mean
everyone who took one dose, or everyone with at least one post-baseline
measurement. "Modified ITT" is honest about excluding someone but says nothing
about who or why. "Per-protocol" describes a set defined after randomisation, so
it has forfeited the protection randomisation bought. The question the tool asks
is how many randomised participants ended up in the primary analysis and on what
grounds any were dropped — not which of the three phrases the authors chose. An
ITT label alone does not make an analysis valid, and an mITT label alone does not
make one invalid.

**Non-inferiority, equivalence and superiority are three different claims.**
Superiority asks whether the new treatment is better. Equivalence asks whether it
is neither meaningfully better nor meaningfully worse, and needs a margin in both
directions. Non-inferiority asks only whether it is not worse by more than a
stated amount, and is one-directional by design. A non-inferiority result is
compatible with the new treatment being slightly worse, exactly as much worse as
the margin permits. It never establishes equivalence, and it never establishes
superiority — a superiority claim from a non-inferiority trial requires a
pre-specified testing procedure, not an after-the-fact look at whether the
confidence interval happened to exclude no difference.

**Non-inferiority for one endpoint is not non-inferiority for another.** The
margin was justified for a particular outcome, the trial was powered for that
outcome, and the conclusion belongs to it. A drug shown not to be meaningfully
worse at shortening symptoms has been shown nothing whatsoever about death,
hospitalisation or a rare harm, and the gap is widest exactly where readers most
want to close it. This is the same discipline as RoB 2's rule that a risk-of-bias
judgement attaches to a specific result rather than to a trial.

---

## 7. Non-inferiority trials

Non-inferiority gets a `ChecklistGroup` of its own, matched against
`DesignClassification.subtype` and **added to** the design's ordinary items
rather than replacing them. A non-inferiority trial still has to survive
randomisation, concealment, attrition and outcome measurement like any other, and
the added items sit on top.

### The margin

A non-inferiority trial cannot be interpreted without its margin, and a margin
needs two independent justifications.

- **Clinical.** How much worse could the new treatment be and still be worth
  using, given whatever it buys you — fewer interactions, oral administration,
  cost, tolerability? This is a value judgement about an acceptable loss, and it
  belongs to the reader and the patient, not to the trialists and certainly not
  to a tool.
- **Statistical.** The margin must be anchored to what the active comparator is
  actually known to do against no treatment, with an allowance for the
  uncertainty in that historical estimate. A margin chosen to make the trial
  affordable is how a treatment no better than placebo gets declared
  non-inferior to one that works.

An appraisal item that asks only "was a margin pre-specified" has asked a
reporting question. The item asks what the margin was and what it was justified
against.

### Assay sensitivity and the constancy assumption

Non-inferiority borrows its meaning from history. There is no internal control
arm demonstrating that anything worked in _this_ trial, so two assumptions do the
work.

**Assay sensitivity** is the trial's ability to have detected a difference had
one existed. A trial run in a population who mostly recover regardless, with an
insensitive endpoint, sloppy adherence or excessive measurement noise, will
produce two indistinguishable arms whether or not the treatments differ — and
"indistinguishable" is the non-inferiority conclusion.

**Constancy** is the assumption that the comparator's historically established
benefit still holds under this trial's conditions. Change the population, the
background care, the dose, the timing or the outcome definition from the trials
that established the comparator, and the margin derived from them no longer means
what it was calculated to mean. Constancy is rarely tested and frequently
assumed; a reader's job is to notice how far the present trial has drifted from
the evidence its margin rests on.

### The direction of bias inverts

This is the point most readers have backwards, and it is why the checklist treats
analysis sets differently here.

In a superiority trial, an intention-to-treat analysis is conservative: people
who did not take the drug, or crossed over, dilute the difference between arms
and push the estimate toward no effect, making it _harder_ to declare a winner.
The bias works against the claim being made.

In a non-inferiority trial, the claim being made is that the arms are not far
apart. The same dilution now pushes the estimate toward exactly the answer the
trial is looking for. **Non-adherence, crossover and measurement noise make
non-inferiority easier to declare, not harder.** Sloppy conduct is rewarded.

So "the ITT analysis showed non-inferiority" is not, on its own, the reassurance
it is in a superiority trial. The corresponding item asks whether analyses defined
differently agree.

And the mirror-image error has to be avoided at the same time: **a per-protocol
analysis is not the trustworthy one.** It is defined by post-randomisation
behaviour, so it has abandoned the balance randomisation created and can be
biased in either direction. Neither set is the right answer alone. What supports
a non-inferiority conclusion is _concordance_ — the analyses defined on different
principles pointing the same way, with the amount of non-adherence small enough
that they could not have diverged much anyway. What undermines it is either a
divergence between them or a level of non-adherence high enough that the two are
not really testing the same thing.

---

## 8. A worked example: VV116 versus nirmatrelvir–ritonavir

Used here to show what the reasoning looks like, not to issue a verdict. The
trial is a reasonable one; the point is what a careful reader can and cannot take
from it.

> Cao B et al. _VV116 versus Nirmatrelvir-Ritonavir for Oral Treatment of
> Covid-19._ N Engl J Med 2023;388:406-417. PMID 36577095.
> DOI 10.1056/NEJMoa2208822.

### What the report establishes

- 822 participants randomised 1:1 through a centralised interactive web response
  system.
- The primary analysis population was the 771 who were randomised **and** received
  at least one dose — a modified intention-to-treat or full analysis set, not
  strict ITT. 51 randomised participants never received treatment.
- 741 of the 822 completed 28-day follow-up; 30 discontinued.
- Primary endpoint: time to sustained clinical recovery through day 28.
- Non-inferiority required the lower bound of the two-sided 95% confidence
  interval for the hazard ratio to lie above 0.8. The result was HR 1.17
  (95% CI 1.02–1.36), so the criterion was met.
- The margin of 0.8 was justified against an assumed reference recovery duration
  of 5.5 days — that is, about 6.875 days, roughly 25% longer recovery.
- Per-protocol and early-treatment analyses and a missing-data sensitivity
  analysis also supported non-inferiority. The analysis of all randomised
  participants was post hoc.
- The trial was described as observer-blinded.
- No participant in either arm died or progressed to severe Covid-19 by day 28.
- Funding was reported as Vigonvita Life Sciences and others.

### Reading 1 — name the analysis set accurately

771 of 822 is 94%, and the 51 excluded were excluded for a reason that is at
least principled and is stated. This is a defensible primary analysis set. It is
also not intention to treat, and calling it ITT in a journal club summary would
misdescribe it.

The appraisal question is not which label the authors used but what the exclusion
could have done. Participants who were randomised and never dosed are excluded on
the basis of a post-randomisation event, so the tool's item asks how many were
dropped, whether the reason could plausibly relate to the assignment, and whether
the numbers were similar in the two arms. Note also that the analysis of all
randomised participants — the one closest to strict ITT — was post hoc, which
changes what weight it can carry: it is reassuring where it agrees, but it was
not the pre-specified test.

Both halves of the principle apply here. The mITT label does not make the
analysis invalid, and an ITT label would not have made it valid.

### Reading 2 — "observer-blinded" does not settle outcome measurement

Observer-blinded says the people assessing the outcome did not know the
assignment. It says nothing about the participants. When the endpoint is
_sustained clinical recovery_ defined on symptoms, a substantial part of the
measurement runs through the participant, and the two treatments differ in
regimen. Whether that matters is a judgement about how much a participant's
belief could move the symptom threshold and its timing.

The point is not that the trial is compromised. It is that "observer-blinded"
answers a different question from the one the item asks, which is whether
knowledge of assignment could have moved _this_ outcome, and through whom. From
an abstract, that is frequently an Unclear with `needs: full-text`, and the
Unclear is the right answer.

### Reading 3 — the margin is a clinical judgement the tool must not make

0.8 on the hazard ratio was anchored to an assumed reference recovery of 5.5
days, and the arithmetic gives about 6.875 days: a treatment could leave people
symptomatic roughly 25% longer and still clear the bar.

Is 25% longer an acceptable price? That depends on what the alternative costs,
what the drug interactions of the comparator are for this patient, what else the
patient is taking, and what a day and a half of symptoms is worth to them. It is
a value judgement, it varies by patient, and **the tool records the margin and
asks whether it was justified clinically and statistically — it never rules on
whether the margin was reasonable.**

One caveat a careful reader should add: converting a hazard-ratio margin into "so
many days" is itself an approximation that leans on the relationship between
hazards and times holding steady over follow-up. The 6.875-day figure is a way to
make the margin intuitively graspable, not a second result.

### Reading 4 — nothing was shown about severe disease or death

There were no deaths and no progressions to severe Covid-19 in either arm.

Zero events in both arms is not evidence of similarity. It is an absence of
information about a rare outcome in a trial that was neither designed nor powered
to observe it. With roughly 385 participants per arm and no events, the ordinary
rule-of-three bound leaves a 28-day risk that could be anywhere up to about 1% in
either arm — which is to say, wide open relative to the differences anyone would
care about. No margin was specified for these outcomes, no non-inferiority test
was performed on them, and none could have been.

**A summary stating that VV116 was non-inferior to nirmatrelvir–ritonavir for
preventing severe Covid-19 or death would be false.** Not cautious, not
over-reaching: false, as a description of what the trial showed. It is also
precisely the sentence a hurried reader writes, which is why it appears as the
worked example in `src/prompts/appraisal-guardrails.md`.

### Reading 5 — the interval excludes 1, and that is still not superiority

The lower bound of 1.02 lies above 1. A reader who is primed to look for winners
will read that as "VV116 was better". A non-inferiority design does not license
the step. Whether a superiority claim is available depends on whether a
superiority test was pre-specified in the trial's testing sequence — a
full-text-or-protocol question, and therefore an Unclear from an abstract, not an
inference. The tool's non-inferiority items are built so that this stays a
question rather than becoming a conclusion.

### What the appraisal looks like

Working from the abstract alone (`Appraisal.sourceScope` of `abstract`), a
reasonable appraisal of this trial has Yes on the randomisation mechanism, a
recorded fact under the funding `InfoPanel`, and several Unclears — on
concealment, on outcome measurement, on whether the primary endpoint matched a
registered one — each pointing at the document that would settle it. That is not
a weak appraisal. It is an accurate one, and the list of Unclears is the reading
plan.

---

## 9. Limits of this methodology, stated up front

- **It is usually an abstract-only assessment.** The tool reads a PubMed abstract
  page. It has no access to the full text, the supplement, the protocol or the
  registry entry, so for a large fraction of items the honest verdict is Unclear
  until the reader goes and looks. The export carries the source scope so that a
  summary cannot quietly claim more than its basis.
- **There is no aggregate judgement.** Items do not roll up into a domain
  judgement, a risk-of-bias level or a score. Any aggregation would have to
  reproduce an instrument's algorithm, which would misrepresent both the
  instrument and the item-level answers feeding it.
- **Design detection is rule-based and fallible.** It reads publication types and
  abstract keywords, reports the evidence it used and its confidence, and is
  always overridable — including the subtype, so the non-inferiority items can be
  turned on when detection misses them.
- **It is not a substitute for a formal assessment.** If you are producing a
  systematic review, use the instrument itself.
- **The bottom line is the user's.** `Appraisal.bottomLine` is free text the
  reader writes. If it is empty, the export leaves it empty rather than
  generating one.

---

## 10. Decisions and what reversing them would cost

Recorded in the style of `docs/HANDOVER.md` §7, so that a later owner can tell a
deliberate methodological choice from an oversight.

### Unclear is a first-class verdict, not a skipped item

Making Unclear a real answer with its own help text and its own `needs` pointer
is what stops the tool from converting a word limit into a criticism.

**To reverse:** dropping to a binary forces every under-reported method into
either an unearned Yes or a false No, and there is no wording that rescues it.
The `needs` field, the per-item source override and the export's source-scope
line all exist to serve the third verdict and would become dead weight. Treat it
as a redesign of the appraisal model, not a UI simplification.

### Funding is recorded, never scored

Funding sits in `InfoPanel` / `Appraisal.info` as a fact and contributes to
nothing.

**To reverse:** promoting it to a checklist item means deciding what Yes and No
mean for a sponsor's name, which cannot be done without either double-counting
the bias domains it acts through or asserting that industry money is itself a
methodological flaw. Both are defensible-sounding and both are wrong, and a
reviewer who knows the sponsorship literature will say so.

### No overall score, no domain roll-up

Item answers stay item answers.

**To reverse:** an aggregate needs a weighting or an algorithm. Inventing one
makes up methodology; borrowing one from RoB 2 or ROBINS-I means claiming
conformance with an instrument whose items we deliberately did not copy. Either
way the product would be asserting more than its inputs support, and the tool's
one durable promise — that it never puts words in a paper's mouth — goes with it.

### All wording is original

**To reverse:** there is nothing to reverse, and this entry exists to stop anyone
trying. Pasting in an existing checklist would licence-encumber the core asset
and is a pre-agreed no. See section 2 and `docs/SPEC.ja.md` §9, §10.

---

## 11. References

The instruments whose concepts the checklists are built from. Wording in this
product is not taken from any of them.

- Sterne JAC, Savović J, Page MJ, et al. RoB 2: a revised tool for assessing risk
  of bias in randomised trials. _BMJ_ 2019;366:l4898.
- Sterne JA, Hernán MA, Reeves BC, et al. ROBINS-I: a tool for assessing risk of
  bias in non-randomised studies of interventions. _BMJ_ 2016;355:i4919.
- Whiting PF, Rutjes AWS, Westwood ME, et al. QUADAS-2: a revised tool for the
  quality assessment of diagnostic accuracy studies. _Ann Intern Med_
  2011;155:529-536.
- Whiting P, Savović J, Higgins JPT, et al. ROBIS: a new tool to assess risk of
  bias in systematic reviews. _J Clin Epidemiol_ 2016;69:225-234.
- Shea BJ, Reeves BC, Wells G, et al. AMSTAR 2: a critical appraisal tool for
  systematic reviews that include randomised or non-randomised studies of
  healthcare interventions. _BMJ_ 2017;358:j4008.
- Piaggio G, Elbourne DR, Pocock SJ, et al. Reporting of noninferiority and
  equivalence randomized trials: extension of the CONSORT 2010 statement. _JAMA_
  2012;308:2594-2604. PMID 23268518.
- Hopewell S, Chan A-W, Collins GS, et al. CONSORT 2025 statement: updated
  guideline for reporting randomised trials. _BMJ_ 2025;389:e081123.

Worked example:

- Cao B, Wang Y, Lu H, et al. VV116 versus Nirmatrelvir-Ritonavir for Oral
  Treatment of Covid-19. _N Engl J Med_ 2023;388:406-417. PMID 36577095.
  DOI 10.1056/NEJMoa2208822.

---

Journal Club Helper is an educational appraisal aid. It does not provide clinical
recommendations. Verify any appraisal against the full text.
