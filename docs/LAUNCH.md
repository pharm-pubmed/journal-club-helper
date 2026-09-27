# Launch and the first 90 days

How the free version is put in front of its first users, and how the spec §8.1 gates are judged (#32). It follows the 2026-09-27 strategy revision (spec §7, §8, §11). The messages below are drafts. Nothing here has been sent or posted.

Placeholders read `TBD(#nn)`, naming the issue that fills them in.

The goal of the first 90 days is **not installs**. It is 10 people who have a journal club or similar presentation coming up and use the extension to prepare it. It is also to learn whether turning the appraisal into presentation material is a real burden, which is what the paid candidate (#39) would address. Every number in this document is a hypothesis from the spec, not a forecast.

## Before recruiting

- [ ] The listing is live (TBD(#31)), and so is the landing page with its example summary and demo video (TBD(#29)). A person has watched the video through.
- [ ] The repository is public under the organization (#30), so anyone can open the feedback form. Its link is TBD(#30).
- [x] The `feedback` label exists (created 2026-09-27).
- [ ] A place for the validation record exists **outside this repository**. See below: it holds names and dates of real people.
- [ ] Hours are set aside. The spec assumes about 4 hours a week, 50 hours at most over the 90 days. If they are not there, move the dates rather than cutting the observation short.

## Recruiting the first 10 (spec §11.2)

- **Who:** English-speaking pharmacy or medical residents, or students, who will present a paper in the next 30 to 60 days. Start with one group that colleagues or educators can introduce you to. Do not widen the countries or professions at the same time.
- **How:** ask people you know, and educators who run journal club, to pass the message on. Aim for 5 to 10 introductions in the first two weeks. If none of your contacts reach this group, try one public channel at a time (below). If that fails too, reconsider the group.
- **Counted separately:** friends who say they will help. Also any thank-you payment, which is recorded apart from any purchase, and a purchase it subsidizes does not count as demand.

A message for a colleague to forward. Add a sentence about yourself only if it is true.

> I'm looking for a few residents or students who have a journal club or paper presentation coming up in the next month or two.
>
> I've built a free Chrome extension that sits beside a PubMed abstract and walks you through the appraisal. It detects the study design, sets up PICO, works out the absolute effect and the NNT from the abstract's numbers, gives you a checklist for the design, and exports a one-page summary. It does not summarize the paper or tell you what to conclude. It has no account or analytics, and your notes stay in your browser.
>
> Here is an example of the summary it produces and a 30-second demo: TBD(#29)
>
> If you would try it for your next presentation, I'd like to watch you use it once for 20–30 minutes (screen share is fine), and ask a few questions after you present. I'll ask before recording anything, and nothing about patients is involved.

## The observation session (spec §11.3)

20 to 30 minutes, on the paper the person is actually presenting. Ask before recording, and keep patient information out of it. Watch; don't demonstrate.

1. Before they start: when is the presentation, how do they usually prepare, and what do they present with (slides, handout, nothing)? How long does preparation usually take?
2. Let them open their paper and use the panel without help. Note where they hesitate, what they skip, and anything they correct or retype.
3. When they have a summary, ask what they would do with it next. **Watch whether they copy it into slides or a handout, and how long that takes.** This is the burden #39 would remove, if it exists.
4. Ask what was missing, wrong or in the way.

After the presentation, a short follow-up:

- Did you use the summary? What did you change before presenting, and how long did that take?
- Compared with how you usually prepare, was it faster, slower or the same? Include the time spent checking the full text and reformatting.
- Would you use it for the next paper?

Do not pitch the paid version in these sessions. The spec shows a price only once a working paid feature exists (§4.8).

## The validation record (spec §7)

Kept by hand, with each person's consent, **outside this repository**. Contact details are kept apart from the record and deleted when no longer needed. One row per person:

| Field                           | What goes in it                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| ID                              | A code, not a name. The key to the contact list, which is kept elsewhere           |
| Group and how reached           | For example PGY1 pharmacy, via a colleague                                         |
| Start date                      | The day they first used the extension                                              |
| Presentation dates              | The next one, and the one after it when it is known                                |
| First summary completed         | Date, or blank. "Completed" = exported a summary for their own presentation        |
| Reuse                           | Date, or blank. "Reuse" = used it for a different paper or presentation            |
| Preparation time                | Their own estimate, the usual way versus with the extension, reformatting included |
| Reformatting                    | What they did with the summary afterwards, and how long it took                    |
| Problems reported               | Links to the issues opened for them                                                |
| Price shown / purchase / refund | Dates. Filled only once a paid candidate exists                                    |
| Support time                    | Minutes spent helping this person                                                  |

These are small numbers of self-reported figures. Write them up as such, and never as the effect on users in general. Store installs and the store's user counts are a reference for reach only. Do not combine them with this record into a conversion rate.

## The gates (spec §8.1)

The clock starts on the day the free version can be handed to participants. Record each review as a dated entry in `docs/HANDOVER.md` §6, with the numerator, the denominator and the decision.

- **Day 0–30.** Of 10 people observed, have 6 or more completed a summary for their own paper? If not, fix the first-run experience or how people are chosen. The paid feature waits.
- **Day 31–60.** Of those who completed one and have since had another presentation, have 4 or more reused it? And have 3 or more described a concrete reformatting burden and said they would try a paid version at $39 a year? If both, turn the #39 mock-up into a prototype. If no next presentation has come round yet, the gate is undecided: don't substitute a different measure for it.
- **Day 61–90 on.** Offer the working paid candidate, at the same price, to 10 eligible people. After the refund window, have 3 or more actually bought it? Three is a reason to keep testing, not proof of a business. Stay small until the first 5 buyers have bought and used it again. If the prototype is late, extend this period.
- **Before growing.** Of the first 5 buyers who have since had another presentation, have 3 or more used it again? Record support time, refund reasons and the actual net revenue. Grow only if the cost of support is covered and the same route reaches the next customers.

"Eligible" means someone in the target group who finished a trial for their own presentation. If the first 10 are not enough, recruit more on the same terms, and record how many were recruited and how many dropped out.

If a working paid version offered to 10 people gets 0 or 1 purchases, stop adding paid features and ask why they did not buy. If it gets 2, run one more small test. If the customer group or the offer has been revised once and it still does not improve, decide between keeping it as a small free tool and stopping. Tightening the free version is not the default answer.

## Feedback

- **Where it arrives:** the GitHub form (`.github/ISSUE_TEMPLATE/feedback.yml`, labelled `feedback`), store reviews, and what participants tell you.
- **Weekly, for the first 30 days:** read everything new. Open an issue for each distinct problem, link it to the feedback, and close the feedback issue with a pointer to it. Answer store reviews that report a problem, say what changed, and never argue with the rating.
- **Patient information:** if a report contains any, edit it out at once. The form asks people not to include it.

## Public channels, one at a time (spec §11.4)

Only if introductions do not reach enough people. For each channel, first read its current rules: the sidebar, any pinned self-promotion thread, and whether moderator approval is needed. Then post once, with a worked example that is useful on its own, and stay to answer comments. No blanket posting and no paid advertising.

The drafts below are for subreddits. They say that it is free and educational and not affiliated with NLM or NIH. They mention no AI and no price: neither exists in the free version, and a post should not promise either. They say nothing about who made it. Add that only if it is true. These communities notice, and resent, a product post dressed up as a colleague's story.

### r/Residency

**Title:** I made a free Chrome extension for journal club prep: PICO, NNT and a risk-of-bias checklist beside the PubMed abstract

> Journal club prep tends to be the same worksheet every time: PICO, study design, the absolute effect the abstract left out, a validity checklist. So I built that worksheet into a side panel that opens next to a PubMed abstract.
>
> What it does:
>
> - Detects the study design and shows why (publication type, abstract wording). You can override it.
> - Pulls candidate numbers out of the abstract and computes ARR, RRR and NNT, with a 95% CI when there are counts to work from. You confirm every number.
> - A checklist for each design, built on risk-of-bias thinking, that says whether the abstract can even answer the question or you need the full text.
> - Exports a one-page summary as Markdown or text. There's an example here: TBD(#29)
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
> - A one-page summary you can paste into your handout. An example: TBD(#29)
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
