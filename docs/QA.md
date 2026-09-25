# Manual QA script

A pass of about ten minutes over five real PubMed records, run by a person in a real browser before each tagged release. It covers what the automated suites cannot: the live PubMed page, the side panel as a reader sees it, the clipboard, the downloaded file, and persistence across a closed panel. The e2e smoke run (`pnpm test:e2e`) already checks button injection, URL gating, extraction, one NNT and one close-and-restore on saved pages, so this script spends its time elsewhere.

Every expected value below was produced by the shipped code, not written from memory: the classifier, the number extractor, the PICO candidate finder and the effect-measure functions were run over each record's abstract. For 36577095, 36740866 and 34844936 that input was the saved page in `tests/fixtures/pubmed/`. For 38537944 and 2899772 it was the E-utilities `efetch` text, because live PubMed does not serve pages to an automated client (HANDOVER §5). If the live page disagrees with a value here, that is a finding: note it rather than passing the step.

## Before you start (1 min)

1. Download the zip from the **draft** pre-release (HANDOVER §3). That is the file that will be published, so test that file and not a local build. Record its SHA-256 in the results, using `sha256sum` on Linux, `shasum -a 256` on macOS, or `certutil -hashfile <zip> SHA256` on Windows.
2. Unzip it and load the folder unpacked in `chrome://extensions` (developer mode on). Use a profile with no earlier Journal Club Helper data, or clear it first with Settings → **Delete all appraisals**.
3. Note the Chrome version from `chrome://version`.

Throughout:

- The panel remembers the last tab you used across articles. When a step names a tab, click it.
- `Evidence (n)` in the header is collapsed. Expand it to read the items.
- **Pass** means every expected item held.
- Anything else is **Fail** with a one-line note.
- A step that is correct but looks wrong is a Pass with a note.

## The records

| #   | PMID     | What it tests                                              |
| --- | -------- | ---------------------------------------------------------- |
| A   | 36577095 | RCT, non-inferiority subtype, percent pair → NNT, restore  |
| B   | 36740866 | Systematic review / meta-analysis, RR with a baseline risk |
| C   | 34844936 | Cohort, HR, a PARTICIPANTS section feeding Population      |
| D   | 38537944 | Case-control from wording alone, OR, design override       |
| E   | 2899772  | Unstructured abstract (ISIS-2, 1988), manual Counts entry  |

Open each as `https://pubmed.ncbi.nlm.nih.gov/<PMID>/`.

## A. 36577095 — RCT (3 min)

**A1. Detection.** A PubMed search page (`https://pubmed.ncbi.nlm.nih.gov/?term=VV116`) shows no `Journal Club` button. On the abstract page the button sits on the same line as the Abstract heading. Click it: the side panel opens on this article.

The header reads:

- `Study design: Randomized controlled trial`
- subtype line `Non-inferiority design`
- badge `Detected from publication type`
- `Evidence (2)`: `Randomized Controlled Trial · publication type`, `noninferiority · abstract keyword`

**A2. PICO.** Open the PICO tab. The abstract is shown and `Show candidates` is on. Legend counts: **P 1, I 0, C 0, O 2**.

- The P highlight starts `adults with mild-to-moderate Covid-19 with a high risk of progression`. An I candidate overlaps it, which is why I shows 0.
- The O highlights start `primary end point was the time to sustained clinical recovery` and `The incidence of adverse events was lower in the VV116 group`.
- `From the title` offers the title to P, I and C.

Click the P highlight. Its text is added to Population, and an `Also add to` chooser opens. The chooser has all four field buttons, with Intervention marked as suggested.

**A3. Numbers.** One candidate is listed: `67.4% vs. 77.3%`, badge `% pair`. Press **Use**: the result shows **NNT 11**, with CER 77.3%, EER 67.4%, ARR `9.9 points` and RRR `12.8%`. `Which is the control group?` defaults to the second value (77.3%). Switch the control to the first value: the result flips to **NNH 11**. Switch back.

**A4. Appraisal.** The progress line reads `0 of 13 answered`: nine general items plus the four non-inferiority checks, which appear under `Extra checks, added to the list above`. Answer item 1 `Yes` and item 2 `Unclear`, and add a note to item 2. The line reads `2 of 13 answered · 1 Unclear`.

**A5. Export.** In the Export tab, type a one-sentence bottom line.

- **Copy Markdown**, then paste into any text editor. The paste matches the preview. It starts with `# ` and the title, contains `## Clinical question (PICO)`, `## Study design`, `## Key results` (with NNT 11), `## Bottom line` with your sentence, and ends with the line `Generated with Journal Club Helper for educational purposes. Verify against the full text.`
- **Copy plain text**: the same content with upper-case headings (`CLINICAL QUESTION (PICO)`, `STUDY DESIGN`, …) instead of Markdown syntax.
- **Download .md**: the file is `journal-club-36577095.md` and its content equals the Markdown copy.

**A6. Restore.** Close the side panel, reload the PubMed tab, and click `Journal Club` again. Everything from A2–A5 is still there: the Population text, the NNT 11 result, `2 of 13 answered · 1 Unclear` with the note, and the bottom line. Then open a non-PubMed site in the same tab: the panel closes. Go back and click `Journal Club`. The panel reopens with the same state.

## B. 36740866 — SR/MA (1.5 min)

**B1.** The header reads `Systematic review / meta-analysis`, subtype `Meta-analysis`, `Detected from publication type`, with `Evidence (3)`.

**B2.** In the PICO tab, the legend reads **P 0, I 0, C 0, O 5**. The title offer is there for P, I and C.

**B3.** The Numbers tab lists four `ratio` candidates. The first is `relative risk 0.83, 95% confidence interval 0.73 to 0.94`; the other three are `relative risk 0.90`, `relative risk 1.04` and `relative risk 0.83`. Press **Use** on the first. Nothing is calculated yet, the Ratio form is filled with RR 0.83 (0.73–0.94), and focus lands on `Assumed control event rate (ACR)`. Enter `29.8` (the usual-care rate the abstract reports) and press **Calculate**. The result is **NNT 20 (95% CI 13–56)**, with the baseline-risk warning shown.

- **Expected gap, not a defect to fix here:** the abstract's own percent pair, `24.2% v 29.8%`, is **not** listed, because the extractor does not recognise BMJ's bare `v` (#49).

**B4.** Appraisal reads `0 of 9 answered`.

## C. 34844936 — Cohort (1 min)

**C1.** The header reads `Cohort study`, with no subtype line, `Detected from publication type`, and `Evidence (2)`: `Observational Study`, `cohort study`.

**C2.** In the PICO tab, the legend reads **P 1, I 0, C 0, O 1**. The P highlight is from the PARTICIPANTS section and starts `Patients had a baseline eGFR between 10 and 20`.

**C3.** One candidate: `hazard ratios of 0.89 (95% confidence interval 0.87 to 0.92`. Press **Use**, enter ACR `20` and press **Calculate**. The result is **NNT 46 (95% CI 39–63)**, with a hazard-ratio warning alongside the baseline one.

**C4.** Appraisal reads `0 of 10 answered`.

## D. 38537944 — Case-control (1.5 min)

**D1.** PubMed assigns this record no design publication type, so detection falls back to wording. The header reads `Case-control study`, `Detected from abstract keywords`, `Evidence (1)`: `case-control · abstract keyword`.

**D2.** In the PICO tab, the legend reads **P 2, I 0, C 0, O 2**. The P highlights are `Of 108 366 women overall` and a phrase starting `women living in France who had intracranial surgery`.

- **Expected rough edge:** one O highlight starts mid-number, at `061 cases (0.2%)`, because `18 061` is written with a space as the thousands separator (#49). Note it if it looks different on the live page.

**D3.** Two candidates: `odds ratio 3.49 (95% confidence interval 2.38 to 5.10` and `odds ratio 19.21 (95% confidence interval 16.61 to 22.22`. Press **Use** on the first, enter ACR `1` and press **Calculate**. The result is **NNH 42 (95% CI 26–75)**, with an odds-ratio warning. The label is NNH because exposure raises the risk.

**D4. Override.** In the header, set the `Design` select to `Cohort study`. The header shows `Set manually`, and Appraisal switches to the cohort list (`0 of 10 answered`). Press `Reset to detected`: it is back to `Case-control study` and `0 of 9 answered`.

## E. 2899772 — Unstructured abstract (1.5 min)

**E1.** The abstract is one paragraph with no section labels. The header reads `Randomized controlled trial`, subtype `Parallel-group design`, `Detected from publication type`. ISIS-2 is really a 2×2 factorial trial, but the classifier has no factorial subtype, and parallel is its default. That is expected, not a Fail.

**E2.** In the PICO tab, the legend reads **P 0, I 0, C 4, O 3**. The C highlights are the four `placebo …` phrases, found by scanning the whole text because there is no Methods section to scope to.

**E3.** The Numbers tab lists eight `% pair` candidates, the last being `8.0% vs 13.2%`. Press **Use** on it: the result is **NNT 20**.

- **Expected gap:** the headline result, `791/8592 (9.2%) … vs 1029/8595 (12.0%)`, is **not** listed, because prose separates the two fractions (#49).

Enter it by hand. Switch to **Counts**, then enter control `1029` / `8595` and intervention `791` / `8592`, and press **Calculate**. The result is **NNT 37 (95% CI 28–55)**. This is the only mode that produces a CI from an abstract with no reported interval.

## F. Settings and backup (1 min)

**F1.** Open Settings with the gear icon in the panel footer. `Side panel opened` is at least 5, and `Summaries exported` is at least 1 (from A5). `Most recent` lists the articles appraised above.

**F2.** Press **Export all**. A `.json` file downloads.

**F3.** Leave `Merge (recommended)` selected, press **Choose a backup file…**, and pick that file. The report reads `Imported 5 appraisals.`: merge skips only a copy that is older than the one saved here, and these are the same age. Re-opening A still shows its A4 answers.

## Results

Copy this table into the release notes.

```
Build: <commit sha>, zip sha256 <…>
Browser: Chrome <version>, <OS>
Tester, date: <name>, <YYYY-MM-DD>
```

| Step                   | Result | Note |
| ---------------------- | ------ | ---- |
| A1 Detection           |        |      |
| A2 PICO                |        |      |
| A3 Numbers             |        |      |
| A4 Appraisal           |        |      |
| A5 Export              |        |      |
| A6 Restore             |        |      |
| B1–B4 SR/MA            |        |      |
| C1–C4 Cohort           |        |      |
| D1–D4 Case-control     |        |      |
| E1–E3 Unstructured     |        |      |
| F1–F3 Settings, backup |        |      |

A Fail in A1, A3, A5 or A6 blocks the release. Those steps are detection, the arithmetic, getting the summary out, and not losing work. A Fail elsewhere goes into HANDOVER §4 and the release notes, and the release can go ahead.

## Keeping this script honest

When a change moves one of these values on purpose, re-derive it from the code rather than editing the number by hand. A value copied forward without re-running it would let a regression pass. The script does not pin everything, though. No expected NNT here lands on a whole number, so the floating-point ceiling bug from the 2026-09-16 log is caught only by the unit tests.
