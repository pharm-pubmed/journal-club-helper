# Handover

Everything a new owner needs to build, release, and operate this extension. Started on day one and updated at the end of every milestone week (spec §10, §12). Keep it current; it is part of the asset if the project is sold.

## 1. Accounts

| Service                                     | Account                           | Status           | Notes                                                                                                |
| ------------------------------------------- | --------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| GitHub repository                           | `piroshi1989/journal-club-helper` | personal account | Spec §10 requires a dedicated GitHub Org. Transfer the repo once the org exists (tracked in issues). |
| Google account (Chrome Web Store developer) | —                                 | not created      | Must be a dedicated account, never the personal one. Needed before v0.3 submission.                  |
| Domain (landing page, privacy policy)       | —                                 | not registered   | Use a registrar that makes transfer easy.                                                            |
| ExtensionPay / Stripe                       | —                                 | not created      | v0.2. Check transferability before committing (spec §10).                                            |
| Anthropic / OpenAI                          | none                              | n/a              | Users bring their own API keys. The project holds no provider account.                               |
| Bank account for revenue / costs            | —                                 | not created      | Keep separate from personal finances.                                                                |

## 2. Build

Node 22 and pnpm 9 (pinned via `packageManager` in `package.json`; `corepack enable` is enough on a clean machine). No other system dependency, no native toolchain, no service to run.

```bash
pnpm install         # postinstall runs `wxt prepare`, which generates .wxt/tsconfig.json
pnpm dev             # WXT dev server
pnpm build           # .output/chrome-mv3
pnpm zip             # .output/*.zip, the artifact uploaded to the Web Store
pnpm lint            # ESLint
pnpm format:check    # Prettier
pnpm typecheck       # wxt prepare && tsc --noEmit
pnpm test            # Vitest (src/lib unit tests)
pnpm check:manifest  # permission guard, run after `pnpm build`
```

Load the unpacked extension from `.output/chrome-mv3` in `chrome://extensions` with developer mode on.

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, tests with coverage, build, the manifest guard, and zip on every push to `main` and every pull request, then uploads the zip as a 14-day artifact.

**Repo setting still to do by hand:** enable branch protection on `main` requiring the CI check to pass. Not scriptable from the repo, so it has to be set in GitHub settings and re-set if the repo is transferred to a new org.

### Things that will bite a new owner

- **The permission set is enforced, not documented.** `scripts/check-manifest.mjs` fails CI if `permissions`, `host_permissions`, `optional_host_permissions`, or `minimum_chrome_version` differ from spec §5 by even one entry, and it rejects `tabs`, `scripting`, and `<all_urls>` outright. Widening permissions is a product decision (it changes Web Store review and the value of the asset), so the guard is deliberately hard to bypass — edit the allowlist in that script consciously.
- **`chrome.storage.sync` is banned repo-wide** by an ESLint rule, because v0.2 keeps the user's AI API key in settings and it must never sync off the device.
- **`src/lib` may not touch the DOM or `chrome.*`**, also enforced by ESLint, with `src/lib/pubmed-dom.ts` as the single exception. That is what keeps the whole appraisal engine unit-testable without a browser.
- **All cross-module types live in `src/lib/types.ts`** and are re-exported by the module that owns the behaviour. Add a new shared type there, not in the consuming module.

## 3. Release

Not available yet. Filled in for v0.3 (Chrome Web Store submission steps, version bump, changelog, zip upload, review notes).

## 4. Known issues

Nothing is known to be broken. These are the things that are **not yet verified**, all for the same reason: no browser was available while the v0.1 code was written, so every UI claim below rests on unit tests and headless render harnesses rather than on a loaded extension.

| #   | Not verified                                                                           | Why it matters                                                                                                                                              | Issue                   |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | `chrome.sidePanel.open()` succeeding after the content-script → background message hop | The user gesture has to survive that hop. If it does not, the whole open flow needs the fallback in #1 B6. This is the single highest-risk unknown in v0.1. | #5, #25                 |
| 2   | The `Journal Club` button sitting beside the Abstract heading                          | It is appended inside the heading because the heading is block-level. Renders inline in theory; never seen.                                                 | #5                      |
| 3   | `chrome.tabs.onActivated` / `onUpdated` firing without the `tabs` permission           | Reasoned from the permission model and commented in `useArticle.ts`. If they do not fire, the panel stops following tab switches.                           | #6                      |
| 4   | Clipboard, download and storage on Edge and Brave                                      | Chromium forks differ on clipboard permission in side panels.                                                                                               | #25                     |
| 5   | Every layout at 320 px                                                                 | Coded and reasoned for, not looked at.                                                                                                                      | #12, #15, #17, #20, #27 |

Two design limitations that are deliberate, not defects:

- **Design detection reads the whole abstract**, so "previous randomized trials" in a Background section yields `rct` at medium confidence. The header shows the phrase that caused it and the user can overrule it. Pinned by a test.
- **PICO candidate recall is weak for Intervention and Comparison.** Real abstracts write "comparing supplemental oxygen with ambient air", which matches none of the cue phrases, so those fields often fall back to the title. Precision was chosen over recall because a wrong candidate costs the user more than a missing one, and arbitrary text can be selected by hand. If users complain, widening the I and C cues is where to spend, not filtering.

There is **no component test harness in the repo**. The UI was checked with throwaway Preact + happy-dom harnesses that were not committed, so those checks do not run in CI. Adding `@testing-library/preact` is the obvious next step if the UI starts changing often; it was left out because the spec's dependency budget (§5) is deliberately tight.

## 5. External dependencies

| Dependency                                                   | Why                                                        | Risk                                                                       | Mitigation                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| PubMed abstract page DOM (`pubmed.ncbi.nlm.nih.gov/<PMID>/`) | Source of abstract text, publication types, MeSH, citation | Markup can change without notice; the site now blocks non-browser fetches  | Fixture tests in CI; E-utilities fallback; see the two subsections below       |
| NCBI E-utilities `efetch`                                    | Fallback when DOM parsing fails                            | Rate limit ≤ 3 req/s without key; requires tool name + email in User-Agent | Optional host permission, requested only when enabled                          |
| ExtensionPay (v0.2)                                          | Billing                                                    | Transferability on sale unknown                                            | `src/lib/license.ts` abstraction; Stripe Checkout + license key as fallback    |
| Anthropic / OpenAI APIs (v0.2)                               | AI extraction with user's key                              | API changes, cost                                                          | Provider abstraction; prompts in `src/prompts/*.md`                            |
| Chrome Side Panel API                                        | Panel UI                                                   | `sidePanel.open()` needs Chrome 116+ and a user gesture                    | `minimum_chrome_version` is `"116"` and CI enforces it; verify on Edge / Brave |

### PubMed DOM: what the markup actually does

Verified against three saved fixtures in `tests/fixtures/pubmed/` (PMIDs 36577095 RCT, 36740866 meta-analysis, 34844936 cohort). Every point below contradicted a plausible first guess, so re-check them before assuming a parsing bug is ours:

1. **`#publication-types li` over-collects.** On some records each keyword is a dropdown (`div.keyword-actions` > `button.keyword-actions-trigger` plus a nested `ul.keyword-actions-links`), so a descendant selector harvests "Search in PubMed" / "Search in MeSH" as publication types. Take direct `li` children of `#publication-types ul.keywords-list` and read `.keyword-actions-trigger` when present. Same for `#mesh-terms`. There is a regression test.
2. **`#full-view-journal-trigger` is not always there** (present on 36740866, absent on the other two). Order: `meta[name="citation_journal_abbrev"]`, then that id, then `.article-source .journal`.
3. **Two citation-meta dialects.** NLM-supplied records emit repeated `citation_author` plus `citation_publication_date` and `citation_journal_abbrev`. Publisher-supplied records (BMJ) emit one semicolon-separated `citation_authors` and `citation_date`, and no journal abbreviation. Both are handled.
4. **`.cit` is the date/volume string** (`2023 Feb 2;388(5):406-417.`), not a citation container. The year is regexed out of it only as a last resort.
5. **`strong.sub-title` is mixed case with a trailing colon** ("Background:"); the uppercase on screen is `text-transform`. Labels are normalized.
6. **Several `.abstract-content` blocks can coexist** (translated abstracts, e.g. `#fre-abstract`). Order: `.abstract-content.selected`, then `#eng-abstract`, then the first.
7. **`#abstract`'s heading is block-level**, so a sibling button renders below it. The `Journal Club` button is therefore appended as the heading's last child to sit beside it (spec §3-1). **Still to confirm visually on a real page**, along with the Chrome/Edge/Brave user-gesture check in issue #5.

`article.abstract` is the section texts joined with `"\n\n"` **without** the labels; labels live in `abstractSections`. PICO highlighting and number extraction index into that string, so changing the join would silently break both.

### PubMed blocks non-browser fetches

As of 2026-09, `pubmed.ncbi.nlm.nih.gov` answers `curl` with a JavaScript proof-of-work challenge (it posts a SHA-256 nonce to `/_pow/solve`) instead of the page. Consequences:

- **The extension is unaffected.** The content script reads a page the user's own browser already loaded and passed the challenge for.
- **Refreshing the HTML fixtures needs a real browser.** The current ones were taken from the Internet Archive's raw-replay endpoint (`https://web.archive.org/web/<timestamp>id_/<pubmed url>`), which returns the unmodified original response; a 2023 and a 2026 snapshot of the same record have identical markup shape.
- **The weekly Playwright smoke run (issue #24) will meet the same challenge from a CI datacenter IP.** Plan for a headed browser, or accept that the smoke test has to run somewhere with a residential IP, or drop it in favour of fixture tests plus the E-utilities check. This was not anticipated when issue #24 was written.

## 6. Weekly log

- 2026-09-15: Repository created. Spec committed to `docs/SPEC.ja.md`. Milestones, labels, and issues filed for v0.1 through v1.0.
- 2026-09-16: **v0.1 feature work complete** (issues #2–#8, #10–#22). WXT + Preact + Vitest scaffold, CI with a manifest permission guard, the full `src/lib` appraisal engine, all four side panel tabs, and the options page. 351 unit tests over 12 files; `pnpm lint`, `format:check`, `typecheck`, `test`, `build`, `check:manifest` and `zip` all pass. Build is 170 kB, zip 57 kB, and `preact` is the only runtime dependency.
  Three real bugs were caught by writing tests before the code, and are worth knowing about because each would have shipped silently: `Math.ceil(1 / ARR)` returning NNT 11 for a true ARR of 0.1 (IEEE-754); a percent-pair rescan that read `120% vs 45%` as `20% vs 45%`; and `importAll` rolling a device's usage counters backwards when merging an older backup.
  Two more were caught by running the whole chain over real saved PubMed pages rather than hand-written text (`tests/lib/pipeline.test.ts`): a plural "hazard ratios of 0.89" that the extractor ignored, and a `PARTICIPANTS` section whose wording matched no PICO cue. The BMJ cohort fixture yielded zero numbers and zero abstract-derived PICO candidates before those fixes. Keep that test.
  Still outstanding for v0.1: everything in §4, plus issues #9, #23, #24, #25, #26.
