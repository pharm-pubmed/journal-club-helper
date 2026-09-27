# Chrome Web Store listing

The text and assets for the store listing (#27), ready to paste into the Developer Dashboard. What a reviewer asks about permissions and data is in [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md), and this file points there rather than repeating it.

Placeholders read `TBD(#nn)`, naming the issue that fills them in. The listing cannot be submitted while any remain. HANDOVER §3 has the command that finds them.

## Store listing tab

| Field              | Value                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name               | `Journal Club Helper: Critical Appraisal for PubMed`, taken from the manifest                                                                                                                                                  |
| Summary            | Taken from the manifest's `description`, which is the spec §6 text word for word (120 characters, 132 allowed). See below.                                                                                                     |
| Description        | [Below](#description)                                                                                                                                                                                                          |
| Category           | Education. The store now lists Education as a subcategory of Productivity, so this keeps spec §6's reason for choosing Productivity and also puts the item where students and educators look. Check the list in the dashboard. |
| Language           | English                                                                                                                                                                                                                        |
| Store icon         | `store/icon-128.png`                                                                                                                                                                                                           |
| Screenshots        | `store/screenshot-1.png` … `store/screenshot-5.png`, 1280×800, in the order [below](#screenshots)                                                                                                                              |
| Small promo tile   | `store/promo-small-440x280.png`                                                                                                                                                                                                |
| Marquee promo tile | Not needed. It is optional and only used if the store features the item.                                                                                                                                                       |
| YouTube video      | None yet. Spec §11 suggests a short demo for the landing page, which could go here too.                                                                                                                                        |
| Official URL       | TBD(#29), the landing page. The dashboard only offers sites verified in Google Search Console for the publisher account, so verify the domain there first (HANDOVER §3).                                                       |
| Homepage URL       | TBD(#29)                                                                                                                                                                                                                       |
| Support URL        | TBD(#30), the repository's issues page once it has moved to the organization                                                                                                                                                   |
| Support email      | TBD(#30), the project's own address, set as the developer account's contact email                                                                                                                                              |
| Mature content     | No                                                                                                                                                                                                                             |

`scripts/check-manifest.mjs` fails the build if the name is over 75 characters or starts with "PubMed", or if the summary is over 132 characters. The summary is:

> Structured critical appraisal on PubMed: PICO, study design, NNT/ARR, validity checklist, one-page journal club summary.

The store has no keyword field. The spec §6 keywords (critical appraisal, journal club, evidence-based medicine, PICO, NNT, PubMed) each appear once or twice in the description, where the sentence needs them. The store's guidance warns against keyword stuffing, so do not add more.

## Description

Plain text: the field takes no Markdown or HTML. Paste from the line after the fence to the line before the closing one.

```text
Journal Club Helper puts a critical appraisal template next to the PubMed abstract you are reading, so you can work through a paper for journal club without juggling a worksheet, a calculator and three browser tabs.

It does not summarize papers and it does not tell you what to conclude. It gives you the structure of an appraisal, suggests what can be read from the abstract, and leaves every judgement to you.

WHAT IT DOES
• Study design: detects whether the abstract describes a randomized or non-randomized trial, a cohort, case-control or cross-sectional study, a diagnostic accuracy study, or a systematic review or meta-analysis. It shows the evidence it used, and you can change it.
• PICO: a form for Population, Intervention, Comparison and Outcome. Phrases in the abstract that look relevant are highlighted as suggestions. You write the question.
• Absolute effect: picks out candidate numbers from the abstract and computes the absolute risk reduction (ARR), relative risk reduction (RRR) and number needed to treat or harm (NNT/NNH), with a 95% confidence interval when the numbers allow one. It can also apply a risk, odds or hazard ratio to a baseline risk you choose. You confirm every number before it is used.
• Appraisal checklist: questions written for each study design and built on risk-of-bias thinking. Each one says what to look for, and whether the abstract can settle it or you need the full text.
• One-page summary: citation, clinical question, design, key results with the absolute effect, validity and your bottom line. Copy it as Markdown or plain text, or download it as a file.

WHO IT IS FOR
Medical and pharmacy residents, medical students, nurse practitioners and anyone learning evidence-based medicine who needs to present or discuss a paper.

PRIVACY
• No account, no server and no analytics.
• Your appraisals are saved in your browser, on your device, one per article, and you can export or delete them from the settings page.
• The extension reads the PubMed page you are viewing, and no other site.
• It makes one network request of its own, and only when you ask: if a page cannot be read, you can fetch the same record from NCBI. That request sends the article's PubMed ID and nothing you wrote.

HOW TO USE IT
Open any abstract on pubmed.ncbi.nlm.nih.gov and click the Journal Club button beside the Abstract heading, or the extension's icon in the toolbar. The side panel opens beside the page.

PLEASE NOTE
This is an educational tool for critical appraisal and journal club. It is not clinical decision support. It gives no recommendation and no clinical advice, and it must not be used to make decisions about patients. It works from the abstract, so check everything against the full text.

Not affiliated with NLM/NIH or HHS. The PubMed wordmark is a registered trademark of the U.S. Department of Health and Human Services.
```

### Wording review

Checked against the store's policies and the spec's positioning (§1, §9):

- **No clinical claims.** No "diagnose", "treat", "recommend", "decision support" (except to deny it), "accurate", "validated" or "evidence-based answer". The effect measures are described as arithmetic the reader confirms.
- **No endorsement.** PubMed is named only to say which site it works on. "Not affiliated with NLM/NIH" appears, as spec §6 requires, and the owner of the mark is named as PubMed's own disclaimer names it (HHS). No NLM, NIH or HHS logo appears in any asset.
- **No overstatement.** The PICO highlights are called suggestions, as the panel itself calls them. The checklist is called what the tab is called.
- **No superlatives or rankings.** No "best", "#1", "fastest", no user counts and no testimonials.
- **No price.** Nothing paid exists in this version, so no price appears in the listing (HANDOVER §7).
- **No named appraisal instruments.** CASP, JBI, CONSORT and the like are not named, as with the checklists themselves (HANDOVER §2, _Editing the checklists_).
- **No AI.** The AI features are not in this version, so the listing does not mention them. The description is rewritten when they ship.

**A risk to know about:** PubMed's disclaimer says that unauthorized use of the PubMed marks is prohibited. The name and summary use the word to say which site the extension works on, which is how similar extensions describe themselves, and the name does not lead with it (spec §6). The name was decided in spec §13. If the store or HHS ever objects, the fallback is a name without the word, such as "Journal Club Helper: Critical Appraisal", with PubMed mentioned only in the description.

## Screenshots

1280×800 each, in this order. Spec §6 names the five views. The first four show the side panel and the fifth the settings page, each framed beside a one-line caption. The PubMed page itself is left out, so no NLM or HHS branding appears.

`pnpm store:assets` makes every image in `store/` from the built extension (`store/capture.spec.ts`). The panel's page is rendered in a tab, because Playwright cannot capture the side panel itself, and each image is then framed with its caption. It uses a real public abstract, PMID 36740866 (a BMJ meta-analysis, the saved page the e2e tests use), and enters the reader's input through the panel's own controls. Run it again after any UI change the screenshots show, and look at every image before committing it. The icons come from `store/icon.svg` through `pnpm icons`, which the same command runs first. The `store/` folder is not part of the extension zip.

| File                     | View                                                                              | Caption                                            |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| `store/screenshot-1.png` | The design header with its evidence, and a PICO the reader wrote                  | See the study design, and why it was detected      |
| `store/screenshot-2.png` | Numbers: the abstract's relative risk applied to a baseline risk, NNT with 95% CI | Get the absolute effect, not just the relative one |
| `store/screenshot-3.png` | The appraisal checklist, two questions answered from the abstract                 | Work through risk of bias, one question at a time  |
| `store/screenshot-4.png` | Export, with the reader's bottom line                                             | Take a one-page summary to journal club            |
| `store/screenshot-5.png` | Settings                                                                          | Your appraisals stay on your device                |

The store's image guidance prefers full-bleed screenshots of the product. These are framed, because the panel is 400 px wide and a full-bleed shot would have to include the PubMed page. If a reviewer objects, render the panel alone on a plain background instead.

## Privacy practices tab

Every answer is in [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md). Copy it from there, so the form and the record cannot disagree.

| Field                                     | Source in CHROMEWEBSTORE.md                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Single purpose                            | _Single purpose_                                                                       |
| Permission justifications (one per entry) | _Permission justifications_ and _Optional host permissions_, "Why it is needed" column |
| Remote code                               | _Remote code_: No                                                                      |
| Data usage                                | _Data handling_: the three categories it lists                                         |
| Certifications                            | All three can be ticked (_Data handling_)                                              |
| Privacy policy URL                        | TBD(#29), where `docs/PRIVACY.md` is published                                         |

The test instructions tab takes the reviewer notes at the end of CHROMEWEBSTORE.md.

## Distribution

- **Visibility:** Public.
- **Regions:** All regions.
- **Pricing:** Free. Any later paid feature uses its own billing and does not change this setting.
