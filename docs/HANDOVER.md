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

### Driving the extension from an agent

`.mcp.json` configures the [chrome-devtools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp) so a coding agent can install, reload, inspect and trigger the built extension in a real browser. It is committed at project scope on purpose: the UI has no component tests in CI (§4), so a real browser is the substitute, and a new owner gets the setup by cloning.

```bash
pnpm build   # .output/chrome-mv3 is what the agent loads
```

**It needs a local Chrome that the server can launch itself.** Two constraints, both learned the hard way:

- The extension tools only work over a **pipe connection**, i.e. a browser the MCP server started. `--autoConnect`, `--browserUrl` and `--wsEndpoint` are documented as unsupported with `--categoryExtensions` until Chrome 149. Chrome's own guidance currently suggests `--categoryExtensions --autoConnect` together; that combination does not work.
- On WSL it must be a **Linux** Chrome. A Windows Chrome or Edge under `/mnt/c` cannot be driven this way, because the paths the server passes to the browser are Linux paths.

The config resolves the binary as `${JCH_CHROME_PATH:-google-chrome}`, so it works unchanged wherever Chrome is on `PATH`. Set `JCH_CHROME_PATH` to point somewhere else.

Where `sudo` is unavailable, Chrome installs fine into the home directory:

```bash
curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
dpkg-deb -x /tmp/chrome.deb ~/opt/chrome-pkg
mkdir -p ~/.local/bin
ln -sf ~/opt/chrome-pkg/opt/google/chrome/google-chrome ~/.local/bin/google-chrome
```

This drives Chrome only. Edge was checked by hand (§4) and Brave is out of scope (§7).

### Testing on Windows from WSL

Edge lives on the Windows side. Loading an unpacked extension from `\\wsl.localhost\...` is unreliable in Chromium, so copy the build to a Windows-local path first:

```bash
cp -r .output/chrome-mv3/. /mnt/c/Users/<user>/journal-club-helper-build/
```

Then `edge://extensions/` → Developer mode → Load unpacked.

**Repo setting still to do by hand:** enable branch protection on `main` requiring the CI check to pass. Not scriptable from the repo, so it has to be set in GitHub settings and re-set if the repo is transferred to a new org.

### Things that will bite a new owner

- **The permission set is enforced, not documented.** `scripts/check-manifest.mjs` fails CI if `permissions`, `host_permissions`, `optional_host_permissions`, or `minimum_chrome_version` differ from spec §5 by even one entry, and it rejects `tabs`, `scripting`, and `<all_urls>` outright. Widening permissions is a product decision (it changes Web Store review and the value of the asset), so the guard is deliberately hard to bypass — edit the allowlist in that script consciously.
- **`chrome.storage.sync` is banned repo-wide** by an ESLint rule, because v0.2 keeps the user's AI API key in settings and it must never sync off the device.
- **`src/lib` may not touch the DOM or `chrome.*`**, also enforced by ESLint, with `src/lib/pubmed-dom.ts` as the single exception. That is what keeps the whole appraisal engine unit-testable without a browser.
- **All cross-module types live in `src/lib/types.ts`** and are re-exported by the module that owns the behaviour. Add a new shared type there, not in the consuming module.

## 3. Release

Not available yet. Filled in for v0.3 (Chrome Web Store submission steps, version bump, changelog, zip upload, review notes).

## 4. Known issues

Manual passes on **Chrome** and **Edge** on 2026-09-19 cleared most of what was unverified. One real defect came out of them (#43); what is still unchecked is listed below.

### Verified on Chrome, 2026-09-19

Loaded unpacked against PMID 36577095 (one of the saved fixtures, so the expected values were known in advance):

- `chrome.sidePanel.open()` **does** succeed after the content-script → background message hop. This was the highest-risk unknown in v0.1; the fallback drafted in #1 B6 is not needed and the flow stays a single click on the page.
- The `Journal Club` button renders beside the Abstract heading, once.
- `chrome.tabs.onActivated` / `onUpdated` fire without the `tabs` permission, so the panel follows tab switches and restores state on return.
- No layout broke at panel width.

`activeTab` was removed immediately afterwards, in that order deliberately — see §7.

### Verified on Edge, 2026-09-19

Same page, same checks. The extension loads, the button injects, the panel opens, and tab switching preserves the appraisal. `chrome.sidePanel` behaves as it does in Chrome.

Edge also surfaced **#43**: once open, the panel follows the user to every tab and shows its empty state on unrelated sites. Not an Edge defect — `side_panel.default_path` makes the panel global in both browsers — but it reads as clutter in a way that reasoning about it did not convey. Deliberately not fixed blind: opening the panel is the highest-risk path in v0.1 and had only just been confirmed working.

### Still unverified

| #   | Not verified                                       | Why it matters                                                                                                                                                                                                                                                 | Issue |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | **Clipboard copy in the side panel**, any browser  | Chromium forks differ on clipboard permission there. The Export tab is built to show a red "select the preview and copy it yourself" message on denial, so the bad outcome is not a refusal but a button that does nothing visible. Nobody has pressed it yet. | #25   |
| 2   | **Brave**, entirely                                | Out of scope by decision — see §7. Chrome and Edge between them cover the Chromium differences that were worth paying for.                                                                                                                                     | —     |
| 3   | The store-listing screenshots at their final sizes | Not a functional risk; listed so #27 does not assume the panel has been photographed.                                                                                                                                                                          | #27   |

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
  Still outstanding for v0.1: everything in §4, plus issues #9, #24, #25, #26.
- 2026-09-19: CI was uploading no zip artifact while reporting green — `.output` is a dot directory and `upload-artifact` skips hidden paths by default, so `.output/*.zip` matched nothing and the step warned instead of failing. Fixed, and `if-no-files-found: error` added so the next missing artifact breaks the build. Worth remembering as a class of failure: a green check is only as good as what it actually asserts.
  Every open question in #1 was decided and the issue closed; the reasoning is in §7 above. `decision-needed` is now clear across the whole backlog.
- 2026-09-19 (later): **First manual pass on Chrome, and it cleared the biggest unknown.** `chrome.sidePanel.open()` survives the content-script → background hop, so the one-click open flow holds and the #1 B6 fallback is not needed. The button renders beside the Abstract heading, tab switching works without the `tabs` permission, and nothing broke at panel width.
  `activeTab` was then removed, in that order on purpose. The manifest guard failed on the change, as designed, and was updated deliberately; `activeTab` is now also on its forbidden list. Shipped permissions are `storage`, `sidePanel`, and the PubMed host permission.
  Edge and Brave are still untested (#25).
- 2026-09-19 (later still): Adopted two things from Chrome's "build extensions with AI" guidance. `CHROMEWEBSTORE.md` now holds the per-permission justification and data-use answers a store reviewer asks for, next to the code so it cannot drift; update it in the same commit as any manifest change. `.mcp.json` adds the chrome-devtools MCP server so an agent can drive the built extension in a real browser — the substitute for the component tests §4 says are missing.
  Writing that file surfaced one thing: `api.anthropic.com` and `api.openai.com` were declared as optional host permissions with no code able to request them. Removed until v0.2 (#34, #35). Shipped manifest is now `storage`, `sidePanel`, one PubMed host permission, and one optional host for E-utilities.
- 2026-09-19 (Edge): Edge passes the same checks as Chrome — loads, injects, opens the panel, keeps state across tab switches. It also surfaced #43: the panel follows the user to every tab and shows its empty state on unrelated sites, because `side_panel.default_path` makes it global. Present in Chrome too; nobody had noticed because reasoning about "the panel shows a message on other tabs" does not convey how it feels to have a panel follow you around. Left unfixed on purpose — opening the panel is the riskiest path in v0.1 and had just been confirmed working, so the change needs a browser, not an argument.
  Brave dropped from scope (§7). `.md` download confirmed working; the exported file was read end to end, which is how the export defect in §7 was found. Clipboard copy is still unexercised.
  The MCP server as first configured did not work: Chrome's guidance pairs `--categoryExtensions` with `--autoConnect`, but the server's own `--help` says they are incompatible until Chrome 149, and this machine had no Linux Chrome to connect to anyway. Corrected to a pipe connection with an explicit executable path; see §2. Worth remembering that a config lifted from documentation is not a verified config.

## 7. Decisions and why

Standing product decisions, with the reasoning, so a new owner can tell a deliberate choice from an oversight and knows what would have to change to reverse one. Settled in issue #1 on 2026-09-19.

### No telemetry, at all (#33)

The options page tells the user that the usage counts never leave the browser, that the page makes no network request of any kind, and that they can confirm it in the Network tab in seconds. That sentence is literally true and it is worth more than the data would be.

Adding even opt-in counters costs a privacy policy section, a Chrome Web Store data-use disclosure, a server to receive them — which spec §2 lists as a non-goal — and the sentence itself. Usage is counted locally (`src/lib/counters.ts`) and shown back to the user, which is all spec §7 asks for.

**To reverse:** you are building a backend and rewriting the privacy claim in `OptionsPage.tsx`, the store listing and the privacy policy together. Treat it as a product change, not a feature flag.

### The E-utilities fallback waits for v0.3 (#23)

DOM extraction is verified against three real PubMed pages that cover two different `citation_*` meta dialects, structured and inline section labels, and pages with and without `#full-view-journal-trigger`. Shipping the fallback in the MVP would buy an optional-host-permission dialog and a 3 req/s rate limiter before anyone has used the product.

The seam already exists: `PubMedArticle.source` is `'dom' | 'eutils'`, and `extractArticleFromDocument` returns `null` rather than throwing, which is the branch point the fallback plugs into. Breakage detection does not depend on it — `tests/lib/pipeline.test.ts` fails CI if the saved fixtures stop parsing.

### `activeTab` was removed (#25) — done 2026-09-19

The shipped permissions are now `storage` and `sidePanel`, plus the PubMed host permission. Nothing else.

`activeTab` granted nothing the extension used: `chrome.tabs.query` works with no permission at all — that is exactly why `useArticle.ts` can rely on `Tab.url` being populated only for hosts we do hold — and `chrome.tabs.sendMessage` is covered by the host permission. It was kept until the Chrome manual QA had passed, so that a QA failure could not be ambiguous between a real bug and a missing permission. Verify, remove, verify again.

Removing it made `pnpm check:manifest` fail, which is the guard working: it pins the exact array, so no permission can change quietly in either direction. `activeTab` is now on the guard's forbidden list too, so it cannot come back by accident.

**Deviation from the spec.** `docs/SPEC.ja.md` §5 still lists `activeTab`. That file is kept as the original product definition and is deliberately not edited; this section is the operative record of what ships. If you would rather the spec track the product, edit §5 there and say so here.

### Browser support stops at Chrome and Edge (#25)

Brave is not tested and not claimed. Chrome and Edge between them cover the Chromium differences worth paying for, and every hour spent on a third fork is an hour not spent on the checklist wording, which is the actual product.

This is a real trade-off rather than a free one: the pitch is "no servers, no accounts, no analytics", and privacy-minded users are exactly who runs Brave. If Brave reports come in after launch, treat them as signal and test it then — nothing in the code is Chrome-specific, so the likely outcome is that it already works.

### The export never claims something about the paper it cannot know

Spec §4.5 mandates the literal sentence "Absolute effect not reported in the abstract." when no absolute effect could be computed. Shipped as written, it covered two different situations and was false in one of them: an appraisal nobody had filled in produced that sentence for PMID 36577095, whose abstract plainly reports "67.4% vs. 77.3%".

The sentence is now reserved for the case it was written for — a relative effect was recorded and no absolute one, which is the failure mode journal clubs keep repeating. An appraisal with nothing entered says "Absolute effect not calculated in this appraisal." instead, which claims nothing about the study.

This is a deliberate deviation from the literal spec wording, on the principle that a summary someone carries into a journal club must never put words in a paper's mouth. Found by exporting a real appraisal and reading it, not by a test.

### Declared permissions track the code, not the roadmap

Two removals in v0.1 follow the same rule, and it is worth stating as a rule because it will come up again: **the manifest describes what this version can actually do.**

- `activeTab` granted nothing the code used.
- `api.anthropic.com` and `api.openai.com` were declared as optional host permissions before any code could request them. A reviewer asking what the extension does with `api.anthropic.com` would have found no answer in the binary. They return with #34/#35 in v0.2; `eutils.ncbi.nlm.nih.gov` stays because #23 is the near-term use.

Restoring an optional host permission at a version bump is a manifest change, not a re-review of the item, so there is no cost to waiting. `CHROMEWEBSTORE.md` holds the per-permission justification a reviewer asks for and must be updated in the same commit as any manifest change.

### Billing: ask before building (#37, #36)

Spec §10 makes transferability a first-order requirement. So the first step is asking ExtensionPay whether an account transfers to a buyer, not writing code. If it does, use it and ship v0.2 quickly; if it does not, build on Stripe Checkout plus signed licence keys from the start and never migrate paying subscribers.

`$4/month` and `$29/year` remain placeholders. No price appears in the code, the store listing or the landing page until #36 is picked up.

### English only until after v1.0 (#41)

Most of the translation cost is the 55 checklist questions and their help text, which are the core IP and were written from scratch in English. Translating them well needs the English wording to have been used in anger first; translating early risks locking in phrasing that is wrong in both languages.

### The repository moves to a dedicated org before the store submission (#30, #31)

Today the repository URL appears in exactly one shipped place, `src/ui/options/OptionsPage.tsx`. After submission it is also in the store listing and the published privacy policy, and changing it there means a re-review. Branch protection is a repository setting and does not survive a transfer, so re-apply it on the other side.
