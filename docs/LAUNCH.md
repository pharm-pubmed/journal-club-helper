# Launch and the first 90 days

What to do once v0.3 is live in the Chrome Web Store (#31), and how the spec §8 gates are judged (#32). The posts below are drafts. Nothing here has been posted.

Placeholders read `TBD(#nn)`, naming the issue that fills them in.

## Before posting

- [ ] The listing is live, and its link is in each post below (TBD(#31)).
- [ ] The repository is public under the organization (#30), so the feedback form below can be opened by anyone. Its link is TBD(#30).
- [x] The `feedback` label exists (created 2026-09-27).
- [ ] **Each subreddit's rules have been read that week**, including the sidebar and any pinned self-promotion thread. The rules change, and the drafts were written without access to them. If a subreddit allows self-promotion only in a weekly thread, or only with moderator approval, do that instead. If it forbids it, skip that subreddit.
- [ ] The account posting is one the project can hand over, or it is clearly a person speaking for themselves. Spec §10 keeps project accounts apart from personal ones.
- [ ] Space the posts a few days apart, and stay around to answer comments on each one.

## Post drafts

All three say plainly that it is free and educational, and that it is not affiliated with NLM or NIH. None mentions AI or a price. Neither exists in v0.3, and a post should not promise either.

The drafts say nothing about who wrote the extension. Add a sentence about yourself only if it is true. These communities notice, and resent, a product post dressed up as a colleague's story.

### r/Residency

**Title:** I made a free Chrome extension for journal club prep: PICO, NNT and a risk-of-bias checklist beside the PubMed abstract

> Journal club comes around every month in residency, and the prep is the same worksheet every time: PICO, study design, the absolute effect the abstract left out, a validity checklist. So I built that worksheet into a side panel that opens next to a PubMed abstract.
>
> What it does:
>
> - Detects the study design and shows why (publication type, abstract wording). You can override it.
> - Pulls candidate numbers out of the abstract and computes ARR, RRR and NNT, with a 95% CI when there are counts to work from. You confirm every number.
> - A checklist for each design, built on risk-of-bias thinking, that says whether the abstract can even answer the question or you need the full text.
> - Exports a one-page summary as Markdown or text.
>
> It does not summarize papers and it does not tell you what to conclude. You write the judgements. It is free, it has no account and no analytics, and your notes stay in your browser. It is not affiliated with NLM or NIH.
>
> Chrome Web Store: TBD(#31)
>
> I would really like to hear where it gets in the way or gets something wrong. There is a feedback form here: TBD(#30)

### r/pharmacy

**Title:** Free Chrome extension for drug literature evaluation: NNT/NNH from the abstract, PICO and a design-specific checklist

> For anyone doing journal club or drug information during residency or rotations. I made a side panel for PubMed abstracts that sets up a critical appraisal:
>
> - PICO, with the matching sentences in the abstract highlighted.
> - ARR, RRR and NNT or NNH from the event rates or counts in the abstract, with a 95% CI when the counts allow one. It can also convert a hazard, risk or odds ratio at a baseline risk you choose.
> - Checklists for RCTs, non-inferiority trials, cohort and case-control studies, systematic reviews and diagnostic studies.
> - A one-page summary you can paste into your handout.
>
> It is an educational tool, not clinical decision support: it gives no recommendations, and every judgement in the summary is typed by you. Free, no account, no analytics, and not affiliated with NLM or NIH.
>
> Chrome Web Store: TBD(#31)
>
> Feedback, especially from anyone who teaches literature evaluation: TBD(#30)

### r/medicalschool

**Title:** Free tool for learning critical appraisal: a side panel on PubMed that walks you through PICO, NNT and bias

> The hard part of learning EBM is usually not the definitions but applying them to a real abstract. So I made a Chrome extension that opens beside any PubMed abstract and gives you the structure:
>
> - What kind of study it is, and the evidence for that.
> - PICO, which you fill in, with hints from the abstract.
> - The absolute effect and the NNT, worked out from the numbers in the abstract, with the formula one click away.
> - Checklist questions for the study design, each with what to look for and why it matters.
> - A one-page summary for journal club or your notes.
>
> It never writes the conclusion for you, which is rather the point. It is free, has no account or tracking, and is not affiliated with NLM or NIH.
>
> Chrome Web Store: TBD(#31)
>
> If something is confusing, I want to know: TBD(#30)

## Feedback, the first 30 days

- **Where it arrives:** the GitHub form (`.github/ISSUE_TEMPLATE/feedback.yml`, labelled `feedback`), store reviews, and comments on the posts.
- **Weekly, for 30 days:** read everything new. Turn each distinct problem into its own issue, linked to the feedback, and close the feedback issue with a pointer to it. Answer store reviews that report a problem. Say what changed, and never argue with the rating.
- **Patient information:** if a report contains any, edit it out at once. The form asks people not to include it.

## The gates

Spec §8. Record each review as a dated entry in `docs/HANDOVER.md` §6: the numbers, where each came from, and the decision.

| Review | Pass if                                  | If it does not pass                                                             |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Day 30 | Weekly users ≥ 100 and rating ≥ 4.5      | Revise the listing and the first-run experience, with an issue for each change. |
| Day 90 | Weekly users ≥ 500 and export rate ≥ 30% | Stay on the free version and keep improving it. Passing starts v0.2 (#34–#37).  |

**Weekly users and rating** come from the Developer Dashboard's statistics for the item, as the store reports them. Note the date range used.

**Export rate** cannot be measured directly. The extension has no telemetry, by decision (HANDOVER §7, #33), and it keeps none. The proxy is what people choose to report:

- The feedback form asks for the two counts the settings page shows: side panel opened, and summaries exported.
- Export rate = the sum of exports ÷ the sum of panel opens, over every report that gives both. Also report how many reports that is.
- It is a biased sample, because people who write feedback are keener than most, so read it as an upper bound. With fewer than 20 reports, record the figure but do not decide on it. Decide on weekly users and on what the feedback says people did with the summary.

A day-90 note might read:

```
- 2027-MM-DD: **Day-90 gate.** Weekly users 612 (dashboard, week ending MM-DD).
  Export rate 41% from 23 reports (95 exports / 232 opens), an upper bound.
  Passed: starting v0.2 with #37.
```
