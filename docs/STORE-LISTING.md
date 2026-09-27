# Chrome Web Store listing

The text and assets for the store listing (#27), ready to paste into the Developer Dashboard. What a reviewer asks about permissions and data is in [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md), and this file points there rather than repeating it.

Placeholders read `TBD(#nn)`, naming the issue that fills them in. The listing cannot be submitted while any remain. `grep -rn 'TBD(#' docs CHROMEWEBSTORE.md` should print nothing on the day of submission.

## Store listing tab

| Field              | Value                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Name               | `Journal Club Helper: Critical Appraisal for PubMed`, taken from the manifest                                              |
| Summary            | Taken from the manifest's `description`, which is the spec §6 text word for word (120 characters, 132 allowed). See below. |
| Description        | [Below](#description)                                                                                                      |
| Category           | Productivity. Spec §6 weighed Education and chose Productivity, because more people search it.                             |
| Language           | English                                                                                                                    |
| Store icon         | `store/icon-128.png` (#27 assets)                                                                                          |
| Screenshots        | `store/screenshot-1.png` … `store/screenshot-5.png`, 1280×800, in the order [below](#screenshots)                          |
| Small promo tile   | `store/promo-small-440x280.png`                                                                                            |
| Marquee promo tile | Not needed. It is optional and only used if the store features the item.                                                   |
| YouTube video      | None                                                                                                                       |
| Official URL       | TBD(#29), the landing page on the project's domain                                                                         |
| Homepage URL       | TBD(#29)                                                                                                                   |
| Support URL        | TBD(#30), the repository's issues page once it has moved to the organization                                               |
| Mature content     | No                                                                                                                         |

`scripts/check-manifest.mjs` fails the build if the name is over 75 characters or starts with "PubMed", or if the summary is over 132 characters. The summary is:

> Structured critical appraisal on PubMed: PICO, study design, NNT/ARR, validity checklist, one-page journal club summary.

The store has no keyword field. The spec §6 keywords (critical appraisal, journal club, evidence-based medicine, PICO, NNT, PubMed) are all in the description, which the store's search reads.

## Description

Plain text: the field takes no Markdown or HTML. Paste from the line after the fence to the line before the closing one.

```text
Journal Club Helper puts a critical appraisal template next to the PubMed abstract you are reading, so you can work through a paper for journal club without juggling a worksheet, a calculator and three browser tabs.

It does not summarize papers and it does not tell you what to conclude. It gives you the structure of an appraisal, fills in what can be read from the abstract, and leaves every judgement to you.

WHAT IT DOES
• Study design: detects whether the abstract describes a randomized controlled trial, a cohort, case-control or cross-sectional study, a diagnostic accuracy study, or a systematic review and meta-analysis. It shows the evidence it used, and you can change it.
• PICO: a form for Population, Intervention, Comparison and Outcome, with the matching sentences from the abstract highlighted as candidates.
• Absolute effect: picks out candidate numbers from the abstract and computes the absolute risk reduction (ARR), relative risk reduction (RRR) and number needed to treat or harm (NNT/NNH), with a 95% confidence interval when the abstract gives enough to calculate one. It can also convert a risk, odds or hazard ratio at a baseline risk you choose. You confirm every number before it is used.
• Validity checklist: questions written for each study design and built on risk-of-bias thinking. Each one says what to look for, and whether the abstract can settle it or you need the full text.
• One-page summary: citation, clinical question, design, key results with the absolute effect, validity and your bottom line. Copy it as Markdown or plain text, or download it as a file.

WHO IT IS FOR
Medical and pharmacy residents, medical students, nurse practitioners and anyone learning evidence-based medicine who needs to present or discuss a paper.

PRIVACY
• No account, no server and no analytics.
• Your appraisals are saved in your browser, on your device, one per article, and you can export or delete them from the settings page.
• The extension reads the PubMed page you are viewing and nothing else.
• Its one network request is made only when you ask for it: if a page cannot be read, you can fetch the same record from NCBI. That request sends the article's PubMed ID and nothing you wrote.

HOW TO USE IT
Open any abstract on pubmed.ncbi.nlm.nih.gov and click the Journal Club button next to the Abstract heading. The side panel opens beside the page.

PLEASE NOTE
This is an educational tool for critical appraisal and journal club. It is not clinical decision support. It gives no recommendation and no clinical advice, and it must not be used to make decisions about patients. It works from the abstract, so check everything against the full text.

Not affiliated with NLM/NIH. PubMed is a registered trademark of the U.S. National Library of Medicine.
```

### Wording review

Checked against the store's policies and the spec's positioning (§1, §9):

- **No clinical claims.** No "diagnose", "treat", "recommend", "decision support" (except to deny it), "accurate", "validated" or "evidence-based answer". The effect measures are described as arithmetic the reader confirms.
- **No endorsement.** PubMed is named only to say which site it works on. "Not affiliated with NLM/NIH" appears, as spec §6 requires. No NLM or NIH logo appears in any asset.
- **No superlatives or rankings.** No "best", "#1", "fastest", no user counts and no testimonials.
- **No price.** Pricing stays out of the listing until #36 (HANDOVER §7, _Billing_).
- **No named appraisal instruments.** CASP, JBI, CONSORT and the like are not named, as with the checklists themselves (HANDOVER §2, _Editing the checklists_).
- **No AI.** The AI features are not in this version, so the listing does not mention them. The description is rewritten when v0.2 ships.

## Screenshots

1280×800 each, in this order. Spec §6 names the five views. The first four show the side panel as the reader sees it, and the fifth shows the settings page. Each sits beside a one-line caption. The PubMed page itself is left out, so no NLM branding appears.

`pnpm store:assets` makes every image in `store/` from the built extension (`store/capture.spec.ts`). It opens a real public abstract (PMID 36577095, the saved page the e2e tests use) and types the reader's input through the panel's own controls. Run it again after any UI change the screenshots show, and look at the images before committing them. The icons come from `store/icon.svg` through `pnpm icons`, which the same command runs first. The `store/` folder is not part of the extension zip.

| File                     | View                                      | Caption                                                           |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| `store/screenshot-1.png` | Design header, with the evidence it used  | See the study design, and why it was detected                     |
| `store/screenshot-2.png` | Numbers: ARR, RRR and NNT with the 95% CI | Get the absolute effect, not just the relative one                |
| `store/screenshot-3.png` | Validity checklist                        | Work through risk of bias, one design-specific question at a time |
| `store/screenshot-4.png` | Export                                    | Take a one-page summary to journal club                           |
| `store/screenshot-5.png` | Settings                                  | Everything stays on your device                                   |

## Privacy practices tab

Every answer is in [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md). Copy it from there, so the form and the record cannot disagree.

| Field                                     | Source in CHROMEWEBSTORE.md                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Single purpose                            | _Single purpose_                                                                                                 |
| Permission justifications (one per entry) | _Permission justifications_ and _Optional host permissions_, "Why it is needed" column                           |
| Remote code                               | _Remote code_: No                                                                                                |
| Data usage                                | _Data handling_. Tick "Website content" only, because of the E-utilities PMID. Every other category is unticked. |
| Certifications                            | All three can be ticked: no sale, no unrelated use, no creditworthiness use (_Data handling_)                    |
| Privacy policy URL                        | TBD(#29), where `docs/PRIVACY.md` is published                                                                   |

## Distribution

- **Visibility:** Public.
- **Regions:** All regions.
- **Pricing:** Free. The v0.2 paid features use their own billing (#36) and do not change this setting.
