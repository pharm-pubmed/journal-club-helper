# Handover

Everything a new owner needs to build, release, and operate this extension. Started on day one and updated at the end of every milestone week (spec §10, §12). Keep it current; it is part of the asset if the project is sold.

## 1. Accounts

| Service                                     | Account                                    | Status       | Notes                                                                                           |
| ------------------------------------------- | ------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------- |
| GitHub repository                           | `pharm-pubmed/journal-club-helper`         | public, org  | Published 2026-11-15 with rewritten history; see §7, _The repository moves to a dedicated org_. |
| Pre-publication repository                  | `pharm-pubmed/journal-club-helper-archive` | private, org | The old history and the review discussion of pull requests #42–#70. Keep it private.            |
| Google account (Chrome Web Store developer) | —                                          | not created  | Must be a dedicated account, never the personal one. Needed before v0.3 submission.             |
| Domain (landing page, privacy policy)       | none, by decision                          | not used     | The site lives at the organization's GitHub Pages URL and the contact is a Gmail address (§7).  |
| ExtensionPay / Stripe                       | —                                          | not created  | After demand validation. Check costs and operating/transfer terms before billing (spec §4.8).   |
| Anthropic / OpenAI                          | none                                       | n/a          | Users bring their own API keys. The project holds no provider account.                          |
| Bank account for revenue / costs            | —                                          | not created  | Keep separate from personal finances.                                                           |

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
pnpm test:e2e        # Playwright smoke: built extension in Chromium, saved pages (run after `pnpm build`)
pnpm test:e2e:live   # the same against live PubMed, headed; a human passes PubMed's check (§5)
pnpm check:manifest  # permission guard, run after `pnpm build`
```

Load the unpacked extension from `.output/chrome-mv3` in `chrome://extensions` with developer mode on.

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, tests with coverage, build, the manifest guard, the e2e smoke tests, and zip on every push to `main` and every pull request, then uploads the zip as a 14-day artifact.

### Driving the extension from an agent

`.mcp.json` configures the [chrome-devtools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp) so a coding agent can install, reload, inspect and trigger the built extension in a real browser. It is committed at project scope on purpose: the UI has no component tests in CI (§4), so a real browser is the substitute, and a new owner gets the setup by cloning.

```bash
pnpm build   # .output/chrome-mv3 is what the agent loads
```

**It needs a local Chrome that the server can launch itself.** Two constraints, both learned the hard way:

- The extension tools only work over a **pipe connection**, i.e. a browser the MCP server started. `--autoConnect`, `--browserUrl` and `--wsEndpoint` are documented as unsupported with `--categoryExtensions` until Chrome 149. Chrome's own guidance currently suggests `--categoryExtensions --autoConnect` together; that combination does not work.
- On WSL it must be a **Linux** Chrome. A Windows Chrome or Edge under `/mnt/c` cannot be driven this way, because the paths the server passes to the browser are Linux paths.

The config resolves the binary as `${JCH_CHROME_PATH:-/usr/bin/google-chrome}`, which is where the `.deb` puts it. **`--executablePath` is not looked up on `PATH`.** A bare `google-chrome` fails with _Browser was not found at the configured executablePath_ even on a machine where `which google-chrome` answers, because the server only resolves the value against its own working directory. So give it an absolute path:

```bash
export JCH_CHROME_PATH="$HOME/opt/chrome-pkg/opt/google/chrome/google-chrome"
```

Export it before starting the agent; `.mcp.json` is read when the session starts, so a change there needs a restart.

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

### `main` is not branch-protected, and cannot be on the current plan

GitHub offers neither branch protection nor rulesets on a private repository owned by a free personal account. The API answers 403, _Upgrade to GitHub Pro or make this repository public_, and so does the settings page. A free organization has the same limit for private repositories, so the org move (§7) does not fix this by itself.

Until it can be fixed, `.claude/settings.json` runs `scripts/require-green-checks.mjs` before every shell command an agent runs in this checkout, and refuses `gh pr merge` unless every check on the PR's head commit has passed. Pending checks and a commit no check has reported on yet both count as not green, and if the checks cannot be read at all the merge is refused. It is a stand-in, not protection: the merge button on github.com, a merge from another machine, and a `gh api` call to the merge endpoint all go around it.

When the plan allows it (Pro, or the org on Team), add the real thing. The required check is `check`, the job name, not the workflow name `CI`:

```bash
gh api -X POST repos/<owner>/<repo>/rulesets --input - <<'EOF'
{
  "name": "main requires CI",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "check" }]
      }
    }
  ]
}
EOF
```

Not yet run, because the current plan refuses the endpoint. Re-apply it after any transfer, and keep the hook or delete it; once the ruleset exists the hook is redundant but harmless.

The hook reads `gh pr view --json statusCheckRollup` rather than `gh pr checks --json`, because the `gh` in Ubuntu's archive (2.4.0) predates the latter.

### Things that will bite a new owner

- **The permission set is enforced, not documented.** `scripts/check-manifest.mjs` fails CI if `permissions`, `host_permissions`, `optional_host_permissions`, or `minimum_chrome_version` differ from spec §5 by even one entry, and it rejects `tabs`, `scripting`, and `<all_urls>` outright. Widening permissions is a product decision (it changes Web Store review and the value of the asset), so the guard is deliberately hard to bypass — edit the allowlist in that script consciously.
- **`chrome.storage.sync` is banned repo-wide** by an ESLint rule, because v0.2 keeps the user's AI API key in settings and it must never sync off the device.
- **`src/lib` may not touch the DOM or `chrome.*`**, also enforced by ESLint, with `src/lib/pubmed-dom.ts` as the single exception. That is what keeps the whole appraisal engine unit-testable without a browser.
- **All cross-module types live in `src/lib/types.ts`** and are re-exported by the module that owns the behaviour. Add a new shared type there, not in the consuming module.

### Stored data

Everything is in `chrome.storage.local`, on the device only. No server holds a copy and there is no account. The code is `src/lib/storage.ts` and the types are in `src/lib/types.ts`.

| Key                           | Holds                                                                                                                                                                                                                                     | Version           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `appraisal:<PMID>`            | One `Appraisal`: citation, detected design, design and subtype overrides, PICO, the Numbers state, each answer with its note and source, the default source (`sourceScope`), the unscored facts (`info`), the bottom line, and timestamps | `schemaVersion` 2 |
| `settings`                    | Local usage counters (`panelOpens`, `exports`, `aiRuns`), shown in Settings and sent nowhere                                                                                                                                              | `schemaVersion` 1 |
| `appraisal-unreadable:<PMID>` | A stored record this version cannot read, moved aside instead of overwritten                                                                                                                                                              | as found          |

- **Limits.** At most 500 appraisals, with the least recently updated evicted first, and 64 KB per appraisal. The extension does not request `unlimitedStorage`, so the browser's 10 MB quota applies.
- **Versioning.** A record whose `schemaVersion` is not the current one is **not migrated**. Version 1 records came from before the 2026-09-21 rework, which renamed item ids, and nothing had shipped yet. A future bump that has to keep users' work needs a migration in `isAppraisal`'s place. Do not simply relax the check.
- **Backups.** Settings → Export all writes `{ schemaVersion: 2, exportedAt, appraisals, settings }`, which is `EXPORT_SCHEMA_VERSION`. Import validates the whole file before removing a single key (§6, 2026-09-21), and `merge` keeps whichever copy of an article is newer.
- **Deleting.** Settings → Delete all removes every key under `appraisal:` and `appraisal-unreadable:` in one `remove` (`deleteAllAppraisals`), including the records this version cannot read and so does not list: those set aside, and version 1 records never reopened. `settings` stays. The page counts those records (`countUnreadableAppraisals`), names them in the confirmation and the result, and keeps the button enabled when they are all that is stored.
- **An open panel is told.** After Delete all or an import, the options page sends `APPRAISALS_REPLACED` with `chrome.runtime.sendMessage`. The side panel drops its pending edit and the appraisal it holds, and restores its article from storage again: a fresh form after a delete, the imported copy after an import. Without this, the panel's next edit wrote the deleted appraisal back. A message was chosen over `chrome.storage.onChanged` because the panel's own autosaves fire that too (the reasoning is in `useAutosave`). Smoke scenario 6 pins it.
  - **Known limit:** a debounced write whose timer fires after storage changes but before the message arrives still lands. The gap is one message delivery and has not been measured.
- **Answers are keyed by item id.** Renaming an item id in a checklist orphans every saved answer to it.
- **Numbers are saved only once they mean something.** The Numbers state is stored when there is a result or a candidate was used (`toAppraisal` in `src/ui/store.ts`). Figures typed in by hand that never produced a result are not saved.
- **Closing the panel does not unmount it.** Autosave is debounced by 500 ms, and closing the side panel tears its document down without unmounting the component, so a flush on unmount never runs.
  - `useAutosave` also flushes on `visibilitychange` to hidden, and on `beforeunload`. It takes the latest state from the store at that moment rather than what is pending, because the effect that schedules a write runs a frame after the edit.
  - Measured in Chromium: `sidePanel.close()` fires only `visibilitychange`, and the panel's own `window.close()` fires both. A write started in `pagehide` does **not** land, so do not move the flush there.
  - Smoke scenario 4 closes the panel both ways, 0 ms after an edit. Both variants fail without `visibilitychange`; the self-close variant alone passes with only `beforeunload`.
  - **Known limit:** closing the tab, or leaving PubMed so that the panel is disabled, gives no event in which a write lands, as measured in review. An edit made in the last half-second before either is lost.

### Editing the checklists

The questions are data, in `src/data/checklists/<id>.json`, one file per checklist. `unclear.json` is the generic fallback, and non-randomized trials reuse `rct.json`.

- **Structure.** Each item has `id` (prefixed with the checklist id), `concept`, `section` (`internal-validity` or `applicability`), `question` (one question, ending in `?`), `why`, `lookFor` (concrete things to look for), and `needs` (the weakest source that can settle it). `groups` hold subtype-specific extras. Each group has an `id`, a `title`, its `subtypes`, a `note` and its own `items`, and the non-inferiority checks are one group in `rct.json`. A group's subtype must be one the classifier or the header can produce. `info` holds unscored facts such as funding.
- **Tests.** `tests/lib/checklist-schema.test.ts` enforces the structure. It also enforces several limits an editor will hit without warning:
  - 6–10 general items per checklist. `cohort.json` already has 10.
  - Questions of at most 200 characters.
  - No instrument names in shipped text.
  - A similarity check against copied wording. `REVIEWED_EXCEPTIONS` lists the reviewed exceptions, and `tests/fixtures/forbidden-phrases.json` lists the banned phrases.

  Changing a question's wording also changes the golden summaries in `tests/fixtures/summary/`, so update them in the same commit.

- **Wording.** Every sentence is original. `docs/METHODOLOGY.md` §2 explains why and records which instruments each checklist draws on. Read its §10 before changing how Unclear or funding is treated.
- **Versions.** Each file has a `version`, but nothing reads it yet and it is not stored with an appraisal. Bumping it does not invalidate old answers. What protects answers is keeping the item `id` stable.

### The arithmetic and where it comes from

All of it is in `src/lib/effect-measures.ts`, a pure module with one function per input shape: `fromRates`, `fromCounts`, and `fromRatio`.

- ARR = CER − EER.
- RRR = ARR ÷ CER.
- NNT = ⌈1 ÷ |ARR|⌉, taken after rounding to 12 significant digits. It is labelled NNH when the intervention is worse.
- A ratio is converted at a reader-supplied baseline risk (ACR). For RR and HR, EER = ratio × ACR. For an OR, the conversion goes through the odds.
- The 95% CI comes from the counts (a Wald interval on the ARR) or from a ratio's own CI, converted the same way as the estimate. Rates carry no group sizes, so they give no CI.

The references are the Cochrane Handbook §12.5 and the CEBM NNT material, both linked from the Numbers tab's _How this is calculated_. The one trap already found is floating point. `111/370 − 74/370` evaluates to 0.09999999999999998, whose reciprocal rounds up to 11 instead of 10. The 12-digit rounding in `ceilPatients` is the fix, pinned by `tests/lib/effect-measures.test.ts`. No QA value lands on a whole number, so the manual pass does not catch it.

## 3. Release

The v0.1 steps below are for an internal pre-release. The store steps follow them.

**v0.1 is an internal release**, a GitHub pre-release with no store listing:

1. `version` in `package.json` is the release version. WXT copies it into the manifest.
2. `main` is green in CI at the release commit. That covers unit tests, e2e on saved pages, `check:manifest` and the zip.
3. Build the zip at that commit with `pnpm install --frozen-lockfile && pnpm zip`. Put it on a **draft** pre-release aimed at that commit: `gh release create v<version> .output/journal-club-helper-<version>-chrome.zip --draft --prerelease --target <sha> --title v<version> --notes "QA pending"`.
   - A draft creates no tag, and `--target` pins the tag to the commit that will be tested, not to whatever `main` is when the release is published.
   - Do not use the CI artifact for this. It arrives wrapped in a second zip, expires after 14 days, and is missing for a run that `cancel-in-progress` cancelled.
4. Someone downloads the zip from the draft, runs `docs/QA.md` against it, and fills in the results table. Also run `pnpm test:e2e:live` once by hand; it is the only check against live PubMed (§4, row 3).
5. Put the QA results into the notes and publish, which creates the tag. `gh` 2.4 has no `release edit`, so use the API: `gh api -X PATCH repos/<owner>/<repo>/releases/<id> -F draft=false -F body=@<notes>`.

### Chrome Web Store (v0.3 onwards)

Written before the first submission, so each step is a plan, not yet a record. Correct it after the first real one (#31). The dashboard changes; where a step below disagrees with it, the dashboard wins, and this section gets fixed.

**Before the first submission, once:**

1. The dedicated Google account exists (#30, §1), never the personal one. It has 2-Step Verification on, which publishing requires, and it has paid the developer registration fee.
2. In the dashboard's account settings: the publisher name, a verified contact email (the project's address from #30), and the trader or non-trader declaration the EU requires.
3. The repository has moved to the organization and is public (#30, §7), so every URL below is final.
4. The landing page and the privacy policy are live over HTTPS (#29, #28). To name the site as the listing's official URL, verify `https://<org>.github.io/journal-club-helper/` in Google Search Console under the publisher account as a URL-prefix property (HTML tag method). Whether the dashboard offers a URL-prefix property on `github.io` is unverified; if it does not, leave the official URL empty, which the listing allows.
5. No placeholder is left. This prints nothing:

   ```bash
   grep -rnE 'TBD\(#[0-9]+\)|TODO\(#2[89]\)' CHROMEWEBSTORE.md docs site src
   ```

   The pattern needs digits after `#`, so it does not match the `TBD(#nn)` in the prose that describes it. It also catches the two TODOs for #28 around `PRIVACY_URL` in `src/ui/options/OptionsPage.tsx`.

**Each release:**

1. Set the version in `package.json`. The store rejects a package whose version is not higher than the one it already has.
2. If the UI changed where the screenshots show it, or the icon changed, run `pnpm store:assets` and look at every image. Commit what changed. This comes before the zip, because it rewrites `src/public/icon/`.
3. If the manifest changed, update `CHROMEWEBSTORE.md` in the same commit. Update `docs/PRIVACY.md` and the data-use answers in `CHROMEWEBSTORE.md` whenever what is **stored** or **sent** changes, for example an API key or a licence in settings. Publish the policy before the release goes live.
4. `main` is green at the release commit. Build the zip there and put it on a draft pre-release, as in v0.1 step 3.
5. Run `docs/QA.md` against that zip. Run `pnpm test:e2e:live` once as well. A person can get through PubMed's check in it (§4, row 3, passed 2026-11-15); if the check ever stops letting them through, record that in the release notes and go on, because the QA pass covers the same scenarios by hand.
6. In the Developer Dashboard: the first time, **Add new item** and upload the zip, which creates the item; after that, upload the zip as a new package on the existing item. Copy the listing from `docs/STORE-LISTING.md` and the privacy practices from `CHROMEWEBSTORE.md`. Paste the reviewer notes at the end of `CHROMEWEBSTORE.md` into the test instructions tab.
7. Submit for review with deferred publishing on, so you choose when it goes live. An approved submission has to be published within 30 days, or it goes back to a draft. Record the submission date and the outcome in §6.
8. Once it is live, publish the draft GitHub release from step 4 as a full release (not a pre-release), with the store version in its notes. The tag then marks the exact package the store has.

A rejection names the policy it cites. Record it in §6 with what was changed, since the next reviewer may raise the same thing.

### Landing site (#29)

`site/` is the whole landing site: `index.html` and `style.css` by hand, and `privacy/index.html`, `sample/index.html` and `favicon.svg` generated from `docs/PRIVACY.md`, `site/sample/summary.md` and `store/icon.svg` by `pnpm site` (`scripts/build-site.mjs`). CI fails if the generated files are out of date, so the published policy is always the committed one. There is no framework, no external font, no script and no analytics. Lighthouse gave the home page and the privacy page 100 in every category, mobile and desktop, on a local server (2026-09-27). The example page has not been measured.

- **Hosting:** GitHub Pages from the organization's repository, deployed by `.github/workflows/pages.yml`. It is chosen because it moves with the organization and costs nothing. There is no custom domain (§7), so the site is served at `https://<org>.github.io/journal-club-helper/`, and every link in `site/` is relative so that subpath works; a test fails on a link from the root. The workflow runs on every push to `main` that touches `site/`, and by hand. First published 2026-11-15.
- **Going live, once #30 is done:**
  1. Enable Pages with the source set to GitHub Actions.
  2. Check that Enforce HTTPS is on in the repository's Pages settings.
  3. Verify the Pages URL in Google Search Console under the publisher account (§3, step 4).
  4. Replace the `TBD(#nn)` placeholders in `site/index.html`: the store link and the contact.
  5. Run the workflow, and add the push trigger its comment describes.
- **Images:** `site/img/*.png` are the unframed panel images from `pnpm store:assets`, so they change together with the store screenshots.
- **Demo video:** `site/video/demo.mp4` (about 33 s, H.264, no sound) and its poster come from `pnpm store:video` (`store/demo.spec.ts`), which needs `ffmpeg` with libx264. It records the panel over CDP while it enters the same appraisal as the store images (`store/scenario.ts`). Re-record it after a UI change it shows, and watch it through before committing.
- **Example summary:** `site/sample/summary.md` is the file the Export tab's **Download .md** saves for the screenshot appraisal, also written by `pnpm store:assets` and linked from the page as the example output (spec §11). A note above it says which parts were typed in by hand. CI checks only that its page matches it, not that it matches the current summary format, so run `pnpm store:assets` again whenever `src/lib/summary-builder.ts` changes what the summary says.

## 4. Known issues

Manual passes on **Chrome** and **Edge** cleared everything that was unverified in the shipped feature set. Two real defects came out of them — #43, and the export wording now recorded in §7 — which is a better return than the passes themselves.

### Verified on Chrome, 2026-09-19

Loaded unpacked against PMID 36577095 (one of the saved fixtures, so the expected values were known in advance):

- `chrome.sidePanel.open()` **does** succeed after the content-script → background message hop. This was the highest-risk unknown in v0.1; the fallback drafted in #1 B6 is not needed and the flow stays a single click on the page.
- The `Journal Club` button renders beside the Abstract heading, once.
- `chrome.tabs.onActivated` / `onUpdated` fire without the `tabs` permission, so the panel follows tab switches and restores state on return.
- No layout broke at panel width.

`activeTab` was removed immediately afterwards, in that order deliberately — see §7.

### Verified on Edge, 2026-09-19

Same page, same checks. The extension loads, the button injects, the panel opens, and tab switching preserves the appraisal. `chrome.sidePanel` behaves as it does in Chrome.

Edge also surfaced **#43**: once open, the panel follows the user to every tab and shows its empty state on unrelated sites. Not an Edge defect — `side_panel.default_path` makes the panel global in both browsers — but it reads as clutter in a way that reasoning about it did not convey. Deliberately not fixed blind: opening the panel is the highest-risk path in v0.1 and had only just been confirmed working. Fixed on 2026-09-22 — see below, including why the fix #43 itself proposed does not work.

### Verified in a browser, 2026-09-21

The critical-appraisal rework and the import fixes were checked on Edge against PMID 36577095.

The appraisal tab renders as designed: Critical appraisal, then internal validity, the non-inferiority group, applicability and the unscored funding panel, numbered 1-13 in one series, with no verdict control anywhere in the funding block and no horizontal scrolling at panel width. Overriding one item's source removes that item's evidence-need hint and no other.

More importantly, the import paths were exercised against real storage. A counters-only backup restored the counts and kept the stored appraisal. A file with no `appraisals` array, a pre-rework export, and a file with neither appraisals nor readable counters were each refused with their own message, **and the saved count did not drop in any of them.** That is the defect the rework introduced, and it is the thing to re-test after any change to `importAll`: an error message appearing is not evidence that nothing was deleted, because the version that had the bug deleted first and reported afterwards.

### #43 fixed — verified in Chrome 2026-09-22, Edge 2026-09-24

The side panel is browser UI, so this one had to be **measured**, not looked at. CDP cannot screenshot the panel, and `document.visibilityState` lies here: a background tab reports `visible` as readily as the active one. What does not lie is the page's own `window.innerWidth` — the panel takes 386 px out of it, 945 px against 559 px in this window. Chrome 153, PMIDs 36577095 and 34844936.

| #   | Step                                   | Measured                                                            |
| --- | -------------------------------------- | ------------------------------------------------------------------- |
| 0   | Fresh install, no tab touched          | PubMed tab enabled, other tab disabled, icon greyed with a reason   |
| 1   | `Journal Club` clicked on an abstract  | panel opens, 945 → 559                                              |
| 2   | Switch to a non-PubMed tab             | **945 — no panel.** This is #43                                     |
| 3   | Switch back                            | 559, and the VV116 appraisal is there again                         |
| 4   | Toolbar icon on a non-PubMed tab       | nothing opens; icon disabled, tooltip says where it works           |
| 5   | Same tab navigated off PubMed          | panel closes, 0 panel documents, icon greys                         |
| 6   | Navigated back to a PubMed search page | icon lit again                                                      |
| 7   | Toolbar icon on that PubMed tab        | panel opens — `openPanelOnActionClick` works with no global default |
| 8   | Result list → abstract, same tab       | panel stays open and binds the article with no second click         |
| 9   | Second PubMed tab                      | panel does **not** follow; one click needed there                   |
| 10  | Clicked there                          | that tab gets its own panel; two documents                          |
| 11  | Back to the first tab                  | its own panel intact, still on its own article                      |

Closing a tab with the panel open logs nothing.

**The control run matters more than the result.** With `side_panel.default_path` restored at runtime and everything else unchanged, step 2 measured 559 px: the panel followed. The per-tab `setOptions({ tabId, enabled: false })` that #43 proposed does **not** override the global default, with or without a `path` alongside it. Deleting the manifest key is what fixes it, which is why `scripts/check-manifest.mjs` now fails if the key comes back.

**Edge, by hand:** the panel opens from the button, is gone on a non-PubMed tab, and comes back with the appraisal on return. The first Edge attempt reported the panel still following — but the Windows-side copy it loads (§2) still held the 2026-09-21 build, `side_panel.default_path` and all. Edge runs that copy, not `.output`, so it has to be re-copied after every build. The quickest tell for which build is running is the toolbar icon on a non-PubMed tab: greyed out with a tooltip is the fixed one.

### Still unverified

| #   | Not verified                                           | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Issue |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Storage quota exhaustion                               | The archive-before-overwrite guard is covered by a test that caps a memory store, not by a real `chrome.storage.local` at its 10 MB limit. Reaching that state by hand needs roughly 160 full-size appraisals or console access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —     |
| 2   | **Brave**, entirely                                    | Out of scope by decision — see §7. Chrome and Edge between them cover the Chromium differences that were worth paying for.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —     |
| 3   | ~~The live smoke run (`pnpm test:e2e:live`)~~          | Done 2026-11-15: a person passed PubMed's check in Playwright's Chromium and all eight live scenarios passed (#67, #68). It still has to be repeated before each release, because it is the only check that notices a PubMed markup change (§5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | #24   |
| 4   | ~~The store-listing screenshots at their final sizes~~ | Done 2026-09-27: `pnpm store:assets` renders them at 1280×800 from the build (§3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | #27   |
| 5   | **The E-utilities fallback after a real grant**        | Smoke scenario 5 checks the request up to the prompt, and scenario 7 everything after an Allow: the request to NCBI and the panel binding the record "via NCBI E-utilities". Only Chrome's own prompt, which no automated run can click, and Chrome asking again after the access is removed are left to a person. Load a build of `main` (v0.1.0 predates #23). On a real abstract page, in DevTools run `document.querySelectorAll('#abstract .abstract-content, #eng-abstract').forEach(e => { e.className = 'renamed'; e.removeAttribute('id'); })` (renaming the class alone is not enough: the reader falls back to `#eng-abstract`), then open the panel (or close and reopen it: an open panel keeps the article it already read, and the fetch buttons only appear when it cannot read the page). Click **Fetch from NCBI**, and grant. The header should show the record, marked "via NCBI E-utilities". Then remove the site access under **Details** in `chrome://extensions`, and check that the next **Fetch from NCBI**, after closing and reopening the panel, asks again. `docs/PRIVACY.md` tells readers they can withdraw it that way. | #23   |

Clipboard copy and the `.md` download were both exercised on Edge and work. Reading the downloaded file end to end is what found the export defect in §7 — the file was correct in every structural respect and wrong in one sentence, which no golden-file test could have caught, because the golden encodes an empty appraisal correctly and cannot know the abstract it is describing.

Two design limitations that are deliberate, not defects:

- **Design detection reads the whole abstract**, so "previous randomized trials" in a Background section yields `rct` at medium confidence. The header shows the phrase that caused it and the user can overrule it. Pinned by a test.
- **PICO candidate recall is weak for Intervention and Comparison.** Real abstracts write "comparing supplemental oxygen with ambient air", which matches none of the cue phrases, so those fields often fall back to the title. Precision was chosen over recall because a wrong candidate costs the user more than a missing one, and arbitrary text can be selected by hand. If users complain, widening the I and C cues is where to spend, not filtering.

One set of gaps was not deliberate: **#49**, three common forms the number extractor missed, found while writing the QA script. Two are **fixed on `main` after v0.1.0 and still present in the v0.1.0 zip**. Run that zip against `docs/QA.md` as of d6b84f1, which expects the gaps; the current file expects the fixes.

- BMJ's bare `v` between two results (`24.2% v 29.8%`). **Fixed.** Read in percent and slash pairs. A capital `V` is not read: standing alone it is a Roman numeral.
- Thousands grouped with a thin space (`18 061`; U+2009 in the source, a plain space once `pubmed-dom.ts` normalises whitespace). **Fixed, narrowly.** Inside a fraction, a space-grouped count is read whole only when the arm's own percentage agrees with the grouped reading and not with the ungrouped one, as in `891/18 061 (4.9%)`. Without that, the arm is dropped rather than guessed. The text cannot tell `62/298 100 days` from `11/90 305 controls`, and reading either one wrong is worse than a miss. U+00A0, U+2009 and U+202F are accepted too. Comma thousands (`5,000`) are read whole. They used to be cut to `5`, which was a wrong pair. The PICO candidate that started mid-number, at `061 cases`, no longer does.
- A fraction pair with prose between its arms. ISIS-2's primary result is written this way. **Still a gap, on purpose.** A first attempt read it when each arm carried a matching percentage, and review found false positives that passed every guard: subgroup splits, nested proportions, two outcomes in one arm, and a three-arm sentence that offered placebo versus overall and lost the real pair. It is left to manual entry, or to the AI extraction (#34).

Still not read after #49: a count with words between it and the slash, such as D's `42 exposed cases/18 061 cases`; a count right after a 1–3 digit number with no percentage to settle it, such as `In 3 120 of 300`; and a count with a number right behind it, such as `45/300 vs 62/298 100 days`. v0.1.0 read the last one, correctly there, as 62/298, but the same reading makes `11 of 90 305 controls` into 11/90. All three are misses, not wrong candidates.

One consequence of the fix to know about: fraction pairs are offered whatever the design. On a case-control abstract such as QA record D, they are the shares of cases and of controls exposed, and an NNH computed from them means nothing. The Numbers tab does not say so; `docs/QA.md` D3 does.

The e2e smoke tests (§5) drive the built extension in Chromium, side panel included: the panel is browser UI rather than a Playwright page, but its document is a CDP target, and `evaluateInPanel` in `tests/e2e/fixtures.ts` runs script inside it. The smoke run uses that for the design header, the Numbers tab, and restoring an edit made just before the panel closed. There is **no component test harness in the repo**. The exceptions are in `tests/ui/`, and all render real code with `preact/test-utils` (part of `preact`, so no new dependency) against fake `chrome.*`: `use-article.test.ts` renders the `useArticle` hook for the E-utilities flow, `use-autosave.test.ts` renders `useAutosave` for a delete or import under an open panel, and `options-page.test.ts` renders the options page over an in-memory store. Other UI checks used throwaway Preact + happy-dom harnesses that were not committed, so those checks do not run in CI. Adding `@testing-library/preact` is the obvious next step if the UI starts changing often; it was left out because the spec's dependency budget (§5) is deliberately tight.

## 5. External dependencies

| Dependency                                                   | Why                                                        | Risk                                                                           | Mitigation                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PubMed abstract page DOM (`pubmed.ncbi.nlm.nih.gov/<PMID>/`) | Source of abstract text, publication types, MeSH, citation | Markup can change without notice; the site now blocks non-browser fetches      | Fixture tests in CI catch our regressions, not PubMed's changes; only the manual live run does (§7). E-utilities fallback on request (#23) |
| NCBI E-utilities `efetch`                                    | Fallback when DOM parsing fails                            | Rate limit ≤ 3 req/s without key; wants `tool` and `email` as query parameters | Requested only after a click and a grant; 3-a-second limiter; `email` is empty until #30                                                   |
| ExtensionPay (v0.2)                                          | Billing                                                    | Transferability on sale unknown                                                | Evaluate after demand validation; isolate license checks when implemented; no automatic custom-backend fallback                            |
| Anthropic / OpenAI APIs (v0.2)                               | AI extraction with user's key                              | API changes, cost, model retirement                                            | Provider abstraction (`src/lib/ai/`); prompts in `src/prompts/*.md`; model ids and prices in `anthropic.ts`, checked 2026-09-26            |
| Chrome Side Panel API                                        | Panel UI                                                   | `sidePanel.open()` needs Chrome 116+ and a user gesture                        | `minimum_chrome_version` is `"116"` and CI enforces it; verify on Edge / Brave                                                             |

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
- **An automated browser does not get through at all.** Measured 2026-09-25 from a residential IP with Playwright's Chromium 153: headless gets a flat **403** on its `HeadlessChrome` user agent; with a normal user agent, and headed, it gets a **reCAPTCHA Enterprise** "Checking your browser" page that never resolves by itself. This is no longer the proof-of-work page `curl` sees. Getting past it would mean defeating bot detection, which is not something to build. A CI datacenter IP can only do worse.
- **So the smoke tests (#24) run in two modes** (`tests/e2e/fixtures.ts`). In CI, Playwright answers the real PubMed URLs with the saved pages and aborts every other request from the page, and the built extension runs against them: button injection, URL gating, `GET_ARTICLE`, the panel's design header, the NNT the Numbers tab computes, and an edit surviving the panel being closed straight after it. That checks the extension, not PubMed, and not PubMed's own scripts either, which are among the aborted requests: a script that re-renders the abstract after load and takes the button with it can only show up live. `pnpm test:e2e:live` runs the same scenarios headed against the live site with a persistent profile (`~/.cache/jch-e2e-profile`, or `JCH_E2E_PROFILE`), and waits up to five minutes for a human to pass the check in the window; one browser serves the whole run, so that should happen once. The search-results check is weaker live, because the real search page has no Abstract heading for a stray button to land on. **That live run is the only thing that notices a PubMed markup change**, and it happens only when someone runs it: do it before each release, and whenever a user reports the button or the article missing.

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
  Brave dropped from scope (§7). Clipboard copy and `.md` download both confirmed working on Edge. Reading the exported file end to end is what found the export defect in §7; the structure was right and one sentence was false, which is the class of defect a golden-file test cannot reach.
- 2026-09-21: **Critical appraisal reworked onto risk-of-bias thinking.** All seven checklists rewritten; the RCT one now follows RoB 2 domains and gains four non-inferiority checks as an additive subtype group. Sections split into internal validity and applicability, funding moved out of scoring into an unscored facts panel, and every item now declares what source can settle it, so an absence of reporting is never read as a flaw the reader has evidence for. `schemaVersion` 2; v1 appraisals are rejected rather than migrated. 420 tests.
  Two things a future editor should not undo without reading `docs/METHODOLOGY.md`: our Unclear is the _signalling-question_ kind, not RoB 2's abolished domain-level Unclear; and the VV116 regression case in `tests/lib/pipeline.test.ts` is deliberately the trial where the obvious conclusion is false.
- 2026-09-21 (later): The rework shipped a data-loss bug and it took two review rounds to close. The export file's own version was left behind when each appraisal moved to schemaVersion 2, so a pre-rework backup passed the gate, replace mode deleted first and validated afterwards, and the store emptied while importing nothing. The second round found the same shape still open for a file whose `appraisals` was missing or not an array, and that rejecting every empty list had taken a legitimate counters-only restore with it.
  All three are fixed, verified on Edge, and the lesson is in the order of operations: validate the whole payload before removing a single key. An error message appearing is not evidence that nothing was deleted.
  A content-script error also appeared and was never diagnosed — it stopped once the page was reloaded, which is what clears the condition. Two things that were wrong regardless are now tested: `chrome.runtime.sendMessage` throws synchronously on a dead extension context so a lone `.catch` never runs, and a throw while reading the page used to take the button down with it.
  The MCP server as first configured did not work: Chrome's guidance pairs `--categoryExtensions` with `--autoConnect`, but the server's own `--help` says they are incompatible until Chrome 149, and this machine had no Linux Chrome to connect to anyway. Corrected to a pipe connection with an explicit executable path; see §2. Worth remembering that a config lifted from documentation is not a verified config.
- 2026-09-22: **#43 fixed, and the fix the issue proposed was the wrong one.** #43 reasoned that a per-tab `sidePanel.setOptions({ enabled: false })` would scope the panel to PubMed tabs. Measured in Chrome 153, it does not: the panel kept following the reader onto every other site. `side_panel.default_path` makes the panel _global_, one panel for the whole window, and a per-tab option does not override it. The manifest key is now deleted by a `build:manifestGenerated` hook in `wxt.config.ts`, the panel is handed to one tab at a time by the background worker, and `scripts/check-manifest.mjs` fails if the key ever returns — the only thing that would fail otherwise is the reader's window.
  Two things worth keeping from how this was checked. The side panel is browser UI, so CDP cannot screenshot it, and `document.visibilityState` is useless here — a background tab reports `visible` too. The page's own `window.innerWidth` is the honest signal, 386 px narrower when the panel is showing. And the run that settled it was the _control_: putting the global default back at runtime reproduced the old behaviour on the same build, which is what turned "the panel does not appear" from an absence of evidence into a measurement. The table is in §4.
  The fix changes one thing for the reader, recorded in §7: the panel is per-tab now, so a second PubMed tab needs its own click. 457 tests.
- 2026-09-24: #43 confirmed on Edge. The first report said the panel still followed; Edge was loading the Windows-side copy of the 2026-09-21 build, which had never been refreshed. Re-copied, reloaded, and it behaves as in Chrome. A failed check on a stale build looks exactly like a failed fix — look at what is loaded before concluding anything.
- 2026-09-25: Went to add the branch protection §2 had listed as a manual step, and found it cannot be set at all: a private repository on a free personal account gets a 403 from both the rulesets and the branch-protection API. The note calling it "not scriptable" was wrong about the reason. `gh api` can set it; the plan refuses it. In its place, a Claude Code hook now refuses `gh pr merge` from an agent unless the PR's checks are green. It does not guard the web UI. The ruleset to add once the plan allows it is in §2.
- 2026-09-25: **#24, the smoke tests, and the part of it that cannot be built.** The plan was a weekly Playwright run against live PubMed. PubMed now answers an automated Chromium with a 403 (headless) or a reCAPTCHA Enterprise page (headed, residential IP), so no scheduled job can reach it, and none was written. CI instead runs the built extension on every PR against the saved pages served at the real URLs, and `pnpm test:e2e:live` runs the same scenarios against the live site with a human passing the check. The reasoning is in §7.
  The fixture run was checked for failing when it should, not just for passing: breaking the abstract selector in `pubmed-dom.ts` fails scenario 2 with a message naming the file, removing the content script's URL gate fails scenario 1, and rounding the NNT down in `effect-measures.ts` makes the panel show NNT 10 and fails scenario 3. That last one is also the proof that the panel checks read the build, not the source. The live run was only started, never taken through the check, so it has neither passed nor been seen to fail; it is in §4's unverified list.
  A fresh-context review of the first version found real defects, the most useful being that the side panel's document _can_ be read over CDP. The first version had assumed otherwise and recomputed the NNT from `src/lib` in Node, which asserted nothing the unit tests did not.
- 2026-09-25 (week 3 checkpoint, #9, #26): **The v0.1 release gate is written down; running it is left to a person.**
  - `docs/QA.md` is a manual pass of about ten minutes over five records: RCT, SR/MA, cohort, case-control, and an unstructured abstract. Every expected value in it was produced by running the shipped code over the record's abstract, not recalled. That is how #49 was found: three common ways of writing a result that the extractor misses. None blocks v0.1, because manual entry covers them.
  - The two new records were confirmed through E-utilities. The first candidate recalled for the case-control slot turned out to be an HPV vaccine trial.
  - **Permissions audit.** The built manifest declares `storage`, `sidePanel`, host `https://pubmed.ncbi.nlm.nih.gov/*`, and optional host `https://eutils.ncbi.nlm.nih.gov/*`, and `check:manifest` passes. This is narrower than the spec §5 draft by `activeTab` and the two AI hosts. Both removals are deliberate (§7, _Declared permissions track the code_).
  - §2 now covers the storage schema, how to edit a checklist, and where the arithmetic comes from. Week 2 of #9 had asked for the last two and they had never been written. §3 has the v0.1 release steps.
  - **Still needed before the tag, and only a person can do it:** run `docs/QA.md`, and take `pnpm test:e2e:live` through PubMed's check once (§4, row 3).
- 2026-09-26: **An edit made just before closing the panel was lost, and the review that suspected it was right.** The review of the QA script had flagged this from reading the code alone, and a spike confirmed it: edits made 0, 20 and 100 ms before `window.close()` were lost, while one made 800 ms before survived. The 800 ms case is the control, and it is what showed the harness measured the right thing.
  - Flushing on `pagehide` changed nothing. A probe then showed that a storage write started in `beforeunload` or in `visibilitychange` lands, and one started in `pagehide` does not.
  - Flushing on the first two kept every edit, 0 ms included. Smoke scenario 4 now pins this, and it fails on the old build.
  - A second fresh-context review found that the `beforeunload` flush had nothing to write at 0 ms: the edit only becomes pending a frame later, and `visibilitychange` had been doing all the work. The listeners now snapshot the store themselves. Scenario 4 gained a `sidePanel.close()` variant, which fires no `beforeunload` at all. The same review measured the limit now in §2: closing the tab or leaving PubMed loses the last half-second.
  - The QA review also corrected Numbers-tab copy that said only Counts mode gives a CI; ratio mode does too (#51).
- 2026-09-26 (later): **#34, the AI extraction core, while the v0.1 QA waits for a person.**
  - Provider contract, prompt, Anthropic client and answer guard are in `src/lib/ai/`. No UI uses them yet, so the shipped build is unchanged (§7, _AI extraction_).
  - A fresh-context review found that the first version enforced "never invent a number" only in the number candidates. A computed difference in a discussion question passed, and a fixture in the tests was modelling exactly that as a correct answer. Grounding now covers every field.
  - The same review found that a cancel landing after the answer arrived still produced a result, and that a key pasted with a zero-width space was reported as a network failure. Both are fixed and tested.
  - The new guards were checked by removing each one: every removal fails a test.
- 2026-09-27: **#23, the E-utilities fallback, brought forward from v0.3.** Billing (#36) waits on the ExtensionPay question (#37), so the AI panel (#35) waits too, by decision. This was the next piece that needed nobody.
  - `src/lib/eutils.ts` reads `efetch` XML into the same shape as the page, and agrees with the page extractor on the fields that matter for the two records saved both ways.
  - Measured, not assumed: the side panel can fetch `efetch` with no host permission, because NCBI allows it cross-origin. The permission prompt is therefore consent our code enforces, not a wall the browser builds (§7).
  - Playwright's routing does not see the panel's requests, and neither does Resource Timing there. Smoke scenario 5 wraps the panel's `fetch` and `permissions.request` instead.
  - A fresh-context review found real defects in the first version, all fixed with tests:
    - the scenario passed with a button that did nothing;
    - a letter with no abstract was presented as a broken page;
    - a grant was thrown away by any tab event, including events from another window;
    - a double click asked twice;
    - the content script had cached its first read, so "Read the page again" and the manual check in §4 could not work;
    - the docs claimed a field-for-field match that did not hold.
  - The recovery itself cannot be driven headless, because the prompt is never answered. It is covered by a hook-level test and listed in §4 as unverified in a browser.
- 2026-09-27 (later): **Delete all did not delete everything, and an open panel could undo it.** A review found three defects in Settings → Delete all, just before the privacy policy was to promise that Delete removes every saved appraisal.
  - It walked `listAppraisals`, which hides what this version cannot read, so records set aside under `appraisal-unreadable:` and version 1 records never reopened both survived. `deleteAllAppraisals` now removes every appraisal key in one call.
  - The button was disabled with nothing listed, so a reader whose only records were unreadable could not delete them at all. The page now counts them, says so, and names them in the confirmation.
  - A side panel open during the delete still held the appraisal in memory, and its next edit wrote the whole thing back. Import had the mirror problem. The options page now announces both, and the panel re-reads storage (§2).
  - Smoke scenario 6 types in the panel, deletes in a real options tab, types again and reads storage. On a build without the panel's listener it fails with the deleted text back in storage. Its passing is also the evidence that the message reaches the panel with no relay through the background worker.
  - Each fix was removed in turn and a test failed each time. An edit still inside the debounce when the message arrives is not something the smoke run can time reliably, so `tests/ui/use-autosave.test.ts` covers that with fake timers. 603 tests.
- 2026-09-27 (later still): **Week 4 paperwork, written ahead of the accounts it waits on (#27, #28, #9).**
  - `docs/PRIVACY.md` and `docs/STORE-LISTING.md` are drafts. Everything that needs the domain, the mailbox or the organization reads `TBD(#nn)`, and §3 says to grep for it before submitting.
  - The icon is new artwork from `store/icon.svg`. The screenshots and the promo tile are rendered from the build by `pnpm store:assets`. Playwright cannot capture the side panel, so the script opens the panel's page in a tab and points its `chrome.tabs.query` at the PubMed tab. Nothing else in the panel is changed.
  - The manifest's `description` is now the spec §6 summary word for word, because the store takes the listing's summary from it. `check:manifest` now also checks the summary's length and that the name does not lead with "PubMed".
  - §3 has the store release steps. They are untested until the first submission (#31).
- 2026-09-27 (last): **#49: BMJ's `v` and space-grouped thousands fixed after v0.1.0; prose-separated fraction pairs left as a gap.** §4 has the rules and what is still not read.
  - The first version also read ISIS-2's prose-separated pairs. A fresh-context review found false positives that passed every guard, including a three-arm sentence that offered placebo versus overall and lost the real pair. The review also showed that the percentage tolerance accepted values that neither round nor truncate. That part was removed, not tuned.
  - The same review found that grouping glued a following number onto a count (`62/298 100 days` read as 298100), and that the fix for inner-group starts had stopped `In 2019 120/300` from being read. Both came from reading too much into a space between digits. A space-grouped count is now kept only when the arm's percentage confirms it, and a count with a number right behind it is dropped, not truncated. Comma thousands were being truncated before #49 (`1 of 5,000` read as 1/5), and are fixed in the same place.
  - PICO windows: the one that started at `061 cases` was the same space read as a word break. The review found one more way a window could start inside a number: figures longer than the 120-character window. The test written for it found a second, a fallback to the raw limit at the window's end, and a cue phrase cut at the comma in `2,345`. All three are fixed, and a shared assertion checks both ends of every candidate.
  - Grouping made the fraction pattern quadratic on a long run of groups. Without a bar on starting a count on an inner group, the runs in the test take 70 to 100 ms. With it they take a few ms, for space, comma and no-break-space runs alike.
  - `docs/QA.md` was re-derived by running records B, D and E through the code again. B gains three `% pair` candidates, D five `n / N` pairs and two O highlights, and E is as in v0.1.0. QA.md now opens with a link to its d6b84f1 version, the one to run against the v0.1.0 zip.
  - Each fix was reverted in turn, and each reversion fails a named test, except NBSP in the PICO word-break check, which changes no behaviour because a no-break space is not a word break there. 605 tests.
- 2026-09-27 (after #49): **#58: an NNH read off a case-control study's exposure proportions now says what it is not.** #49 made record D offer five more such pairs, and the tab computed from them without comment.
  - The wording is in `src/lib/design-caveats.ts`. On a case-control design the note sits above the candidates and beside a Rates or Counts result, and the export carries it under that result in both formats. A Ratio result gets none, because the OR at a baseline the reader supplies is the route that holds. Nothing is removed or refused.
  - Cross-sectional gets a milder, differently worded note, prevalence rather than risk, beside a Rates or Counts result and in the export only. `docs/METHODOLOGY.md` §6 has the reasoning. Diagnostic studies get no note: that is a limit of scope, not a decision.
  - The note is worked out from the design in force whenever the result is shown or exported, not stored with the result, so overriding the design after calculating still reaches both.
  - `docs/QA.md` record D was re-derived by running the `efetch` record through the classifier, the Numbers tab and the export in happy-dom. D3 now expects the note in three places and its absence on the OR result, and D4 expects it to go with the Cohort override.
  - Smoke scenario 3 now overrides the RCT to case-control and checks both places in the built extension, then resets the design, because the profile outlives the test.
  - Each placement was removed in turn and a test failed each time: the note above the candidates, the one beside the result (in the smoke run too, on a rebuilt extension), the export line, the Ratio exemption, and the case-control branch of the wording function. 671 tests.
- 2026-09-27 (after #58): **The landing page gets its real output example and a short demo video (#62, #63).** The strategy revision's §11, still uncommitted when this was written, asks for both before recruiting anyone. Neither promises a paid feature.
  - `/sample/` is the file the panel's Download .md saved for the store images' appraisal, unedited. A note above it says which parts a person typed or chose, that the absolute figures are recomputed from the ratio, and that the bottom line is not a clinical conclusion. The page is `noindex`.
  - Writing that note showed the store images answered checklist item 1 Yes from the abstract, which names a PROSPERO record but not its date. The checklist says the question needs the registry, so it is now Unclear with a note on what to check, and the affected images were re-rendered.
  - A fresh-context review of the builder found a loop that never ended on a line such as `#1 finding`, which predates this change, and DOI links cut at a parenthesis. Both are fixed and tested. Markdown the summary never produces is still refused or passed through as text, not supported.
  - `pnpm store:video` records the panel over CDP and needs ffmpeg with libx264. It shares its input with the store images through `store/scenario.ts`, and after that move `pnpm store:assets` reproduced every image byte for byte. Only sampled frames have been looked at; a person should watch the video through before the site goes live, and Safari playback is untested. 677 tests.
- 2026-09-27 (strategy revision, #65): **The strategy revision is committed, and the issues follow it.** Free release first, then a small cohort, then one paid export tested at $39 a year. §7 _Monetization_ has the summary and the issue changes. `docs/LAUNCH.md` was rewritten for it: recruiting through colleagues, an observation-session guide, a validation record kept outside the repository, and the §8.1 gates with their definitions. The weekly-user and export-rate gates are gone, as is the Reddit-first plan; the subreddit drafts stay, for use one at a time and after each subreddit's rules. The feedback form now also asks whether it was used for a presentation.
- 2026-10-12: **v0.1.0 released (#26).** The manual QA against the draft's zip, run with `docs/QA.md` as of d6b84f1, passed every step on Chrome 154.0.8037.99 on Windows, and the tester's hash matched the zip's. The results are in the release notes. Publishing created the tag `v0.1.0` on `d6b84f1`. The release stays a pre-release, because v0.1 is internal (§3). `pnpm test:e2e:live` was not run for it, and the notes say so; the live run stays open under #24.
- 2026-11-15: **The live smoke run passed for the first time (#24).** A person got through PubMed's check in Playwright's automation-flagged Chromium, so the live half of §7's decision stands. The first two attempts failed on PubMed changes, not on the extension, and both were test fixes:
  - The live page now renders `h1.heading-title` twice (full view and `#short-view-heading`), so the wait for a human to pass the check hit a strict-mode violation (#67). The extractor's `querySelector` already takes the first, full-view heading, as the saved meta-analysis page shows.
  - 36577095 and 34844936 now come with one joined `citation_authors` (`Cao Z;...`) instead of repeated `citation_author` (`Zhujun Cao`). The extractor reads both dialects; the expectation was pinned to the saved fixture's (#68). Exports of these papers now show the short form of author names, as the meta-analysis already did.
  - Third run: 8 passed, 2 skipped (the two fixture-only scenarios).
- 2026-11-15: **No custom domain (#29, #30).** The owner decided to go without one: the site goes on the organization's GitHub Pages URL and the contact is a Gmail address (§7). Every link in `site/` was made relative, since a project Pages URL has a subpath, and a test now fails on a link from the root or to a missing file. Served under `/journal-club-helper/` locally, every link on the three pages returned 200.
- 2026-11-15: **Published as `pharm-pubmed/journal-club-helper` (#30).** A new repository with the author e-mail rewritten out of the history, issue numbers preserved, and the old one kept private as `journal-club-helper-archive`; §7 has why and how. Every repository URL in the code and documents now points at the organization, and the Pages URL is filled in wherever it was a placeholder. Still a placeholder: the contact address, which waits for the dedicated Gmail.
- 2026-11-15: **The project mailbox is `journal.club.helper@gmail.com` (#30).** It is the contact in the privacy policy, the store listing and the landing page, and the E-utilities request now sends it as `email`. The policy and `CHROMEWEBSTORE.md` say so, since what is sent changed.

## 7. Decisions and why

Standing product decisions, with the reasoning, so a new owner can tell a deliberate choice from an oversight and knows what would have to change to reverse one. Settled in issue #1 on 2026-09-19.

### No telemetry, at all (#33)

The options page tells the user that the usage counts never leave the browser, that the page makes no network request of any kind, and that they can confirm it in the Network tab in seconds. That sentence is literally true and it is worth more than the data would be.

Adding even opt-in counters costs a privacy policy section, a Chrome Web Store data-use disclosure, a server to receive them — which spec §2 lists as a non-goal — and the sentence itself. Usage is counted locally (`src/lib/counters.ts`) and shown back to the user, which is all spec §7 asks for.

**To reverse:** you are building a backend and rewriting the privacy claim in `OptionsPage.tsx`, the store listing and the privacy policy together. Treat it as a product change, not a feature flag.

### The E-utilities fallback is offered, never automatic (#23)

When the content script cannot read an abstract page, the panel says so and offers to fetch the same record from NCBI's `efetch`. The reader clicks "Fetch from NCBI", the browser asks for the optional host permission, and only then is the request made. It carries the PMID and `tool=journal-club-helper`. `src/lib/eutils.ts` turns the XML into the same `PubMedArticle` shape the page extractor produces.

- **Where the two sources agree, and where they do not.** A test checks that the title, abstract, sections, DOI, journal, year and full author list agree with the page for the two records saved both ways, and that the design classifier gives the same answer. They do not match exactly on publication types or MeSH terms: the XML adds "Journal Article" and gives bare descriptors where the page shows qualifiers. The header says "via NCBI E-utilities" on a record fetched this way.
- **The permission is consent, not a technical gate.** Measured in Chromium: the side panel can fetch `efetch` with no host permission at all, because NCBI allows cross-origin reads. So "nothing is sent without the grant" is enforced by `useArticle.ts`, which awaits the grant before fetching. The permission request is the first call the click makes, before any await. A unit test pins that ordering, and smoke scenario 5 checks the built extension. The scenario fails when the button does nothing and when a fetch is added before the grant, and both failures were seen.
- **"Could not be read" includes records with no abstract.** Letters and editorials have none, and the page gives no reliable way to tell that apart from a changed layout. So the offer says both are possible. If NCBI confirms there is no abstract, or that the record is a book, the panel says so and stops offering for that PMID for the session.
- **The fetch is not tied to the page reads.** A load event or a switch back to the tab re-reads the page. That must not throw away a grant the reader is in the middle of giving, so the NCBI answer is bound whenever the reader is still on that PMID. It is dropped only when they have moved to another record. Tab events from other windows are ignored.
- **The contact address is the project mailbox.** NCBI asks callers to send `email`, and `EUTILS_CONTACT.email` is `journal.club.helper@gmail.com` (since 2026-11-15, #30). Never put a personal address there; a test pins the value. NCBI also suggests registering the tool and address with them, which has not been done.
- **The limiter is a sliding window, not the token bucket the issue suggested.** A full bucket lets a fourth request through a third of a second after a burst of three, which is four in one second. It is per panel document, so two windows could in principle send six. It never waits more than a second, even if the clock is set backwards.
- **The content script now reads the page on every request, not once at load.** Otherwise "Read the page again" would return the same cached answer.
- **What e2e cannot do.** A headless browser never answers the permission prompt, so recovery after a grant is tested with the real hook, store and parser against fake `chrome.*`, not in the built extension. Seeing it once in a real browser is in §4.

### `activeTab` was removed (#25) — done 2026-09-19

The shipped permissions are now `storage` and `sidePanel`, plus the PubMed host permission. Nothing else.

`activeTab` granted nothing the extension used: `chrome.tabs.query` works with no permission at all — that is exactly why `useArticle.ts` can rely on `Tab.url` being populated only for hosts we do hold — and `chrome.tabs.sendMessage` is covered by the host permission. It was kept until the Chrome manual QA had passed, so that a QA failure could not be ambiguous between a real bug and a missing permission. Verify, remove, verify again.

Removing it made `pnpm check:manifest` fail, which is the guard working: it pins the exact array, so no permission can change quietly in either direction. `activeTab` is now on the guard's forbidden list too, so it cannot come back by accident.

**Deviation from the spec.** `docs/SPEC.ja.md` §5 still lists `activeTab`. That file is kept as the original product definition and is deliberately not edited; this section is the operative record of what ships. If you would rather the spec track the product, edit §5 there and say so here.

### The panel belongs to one tab at a time (#43) — done 2026-09-22

The extension declares no `side_panel` key at all. WXT derives one from the sidepanel entrypoint and a hook in `wxt.config.ts` deletes it again; CI fails if it survives.

That key is what made the panel global, and a global panel is one panel per window: once opened it followed the reader onto every unrelated site, showing "Open a PubMed abstract page to start" over whatever they were actually reading. #43 assumed a per-tab disable would be enough. It is not — measured, not argued (§4). Without the global default, the background worker sets a path on PubMed tabs and disables the rest, and the panel appears only where the extension can do something.

The toolbar icon is disabled on those other tabs, with a tooltip saying where the extension works. A lit icon whose click does nothing is the worse failure: the reader cannot tell it from a broken extension. Nothing is lost by it, because the panel has no view that works without an article — no saved-appraisal browser, no history. Export and import live on the options page, which is reachable from anywhere.

Scoping is by **host**, not by abstract page, so the panel survives the trip back to a result list between two articles. Closing it on every such trip would mean reopening it for each paper, which is the whole session.

The cost, and it is a real one: **a second PubMed tab does not inherit an open panel.** A per-tab panel cannot be opened without a user gesture, so there is no way to hand it to a new tab by itself, and `sidePanel.open()` from a tab-switch handler would be rejected. The reader clicks `Journal Club` once per tab. That is the price of the panel not being somewhere it has no business being, and it was paid knowingly. If it turns out to annoy people, the honest alternatives are worse: a global panel is the bug, and auto-opening is not available.

### The smoke tests run on saved pages in CI, and live only by hand (#24)

Spec §9 asked for a weekly CI run against live PubMed so that markup changes surface early. That run cannot exist: PubMed answers an automated browser with a 403 or a reCAPTCHA page (§5), and getting past it is bot-detection evasion.

What runs instead is split by what each half can actually check. CI serves the saved pages at the real URLs on every push and pull request, which catches the extension breaking: a manifest change, a content script that stops injecting or gating, messaging, the panel failing to open or showing the wrong design or NNT. The live run is local and headed, a human passes the check, and it is the only thing that catches PubMed changing. There is no weekly schedule, because a scheduled job that can only fail teaches everyone to ignore it.

**To reverse:** you need a sanctioned way for an automated client to load PubMed pages, which NCBI does not offer; E-utilities returns XML, not the page the content script reads.

**Deviation from the spec.** `docs/SPEC.ja.md` §5 still says the smoke tests run on real PubMed pages, and §9 that they run weekly in CI. As with `activeTab`, the spec is left as the original product definition and this section is the operative record.

### Browser support stops at Chrome and Edge (#25)

Brave is not tested and not claimed. Chrome and Edge between them cover the Chromium differences worth paying for, and every hour spent on a third fork is an hour not spent on the checklist wording, which is the actual product.

This is a real trade-off rather than a free one: the pitch is "no servers, no accounts, no analytics", and privacy-minded users are exactly who runs Brave. If Brave reports come in after launch, treat them as signal and test it then — nothing in the code is Chrome-specific, so the likely outcome is that it already works.

### The appraisal follows risk-of-bias thinking, not reporting completeness

The first version of the RCT checklist asked what the abstract said. That is the wrong question, and it produced the wrong answers: a trial was marked down for a method an abstract has no room to describe. The rework separates three things that were tangled together.

**A question is about the study's methods.** No item asks what a document happens to mention — a test enforces that no shipped question contains the phrase "the abstract". Each item instead declares, in `needs`, the weakest source that can usually settle it: allocation concealment needs the full text, prespecification needs the protocol or the registry. The reader records what they are working from once (`Appraisal.sourceScope`), overriding it per item where it differs. When the reader has less than an item needs, the UI and the export both say which document would settle it. **Not reported is Unclear, never No.**

The counterweight, so this is not overstated: poor reporting is empirically associated with larger effects, and an Unclear is not a clean bill of health. `docs/METHODOLOGY.md` states the defensible version — absence of reporting tells you about your evidence base, not about the trial's conduct.

**Internal validity, applicability and funding are three different judgements.** Applicability is in its own section with its own explanation, because a flawless trial can fail to transfer and a flawed one can be exactly about your patient. Funding is not scored at all: it is an `InfoPanel`, recorded as fact, because industry funding is not a risk-of-bias finding and a verdict control there would make it look like one.

**A design subtype adds checks; it never replaces them.** A non-inferiority trial gets four more items and remains a randomised trial that has to survive randomisation, concealment and missing data like any other. The design selector still holds eight designs, with the subtype shown and set separately. `getChecklist(design, subtype)` is what attaches the group.

The distinctions the checklists deliberately refuse to collapse — sequence generation versus concealment, blinding versus the bias it prevents, baseline p-values as a statistical error rather than a quality check, analysis-set labels versus what was done, non-inferiority versus equivalence versus superiority — are set out with their reasoning in `docs/METHODOLOGY.md`. Read it before editing any question.

**To reverse:** you are not reverting a checklist, you are reverting a position on what appraisal means. The wording, the `needs` field, the section split and the unscored funding panel all carry it together.

### Import validation and preservation of unreadable records

An import must contain an `appraisals` array. A non-empty array must contain at least one readable, size-compliant appraisal before replacement may delete stored data. Missing or malformed arrays and non-empty lists with no usable appraisals are rejected before mutation. An empty list with readable v1 settings restores only usage counters: merge keeps the higher counts, while replace takes the file counts verbatim. Both modes preserve every appraisal and skip eviction for settings-only imports. Empty files without readable counters receive an empty-backup message, distinct from unreadable appraisal data.

Loading an unreadable appraisal archives it under `appraisal-unreadable:<pmid>` before removing its original key. If preservation fails, the error is surfaced and the original remains. Saving performs the same check even when the caller has not loaded the record or the UI has released an empty form after a restore error. A smaller overwrite can fit the storage quota when an additional archive cannot, so a failed archive must block that overwrite. After space is available, a subsequent edit retries preservation and saving. Archives remain on-device and require manual recovery; they are not included in ordinary exports. Settings → Delete all removes them with everything else (§2).

### The wording guard names its exceptions instead of quoting a headroom number

`tests/lib/checklist-schema.test.ts` compares every shipped question against a corpus of wording from the public instruments. Pairs at or above 0.5 fail the similarity check. Passing means only that this metric found no pair above the threshold in this corpus; it does not prove originality or exclude copying. The second half of the guard is a **reviewed-exceptions list**: any pair at or above 0.30 must carry a recorded reason for accepting the overlap. Tests check the presence and basic structure of that reason, not its authorship, correctness, or human approval; those remain code-review responsibilities. A pair over the bar with no entry fails; an entry whose pair no longer scores over the bar also fails, so the list cannot rot into stale excuses.

The bar is 0.30 because the measured distribution has an empty band there: one pair at 0.333 and the rest at 0.25 and below.

One entry exists today, for the randomisation-sequence question. Its five shared words are the name of the thing being asked about plus the noun "method"; the longest run in common is the two-word term of art. If a future edit pushes another question over the bar, **read that pair and write the reason** — do not move the bar. Raising it makes every entry beneath the new bar stale in the same diff, drawing attention to the change. The tests cannot prevent edits to themselves. Score checks also cannot detect wording changes that preserve the score. The current rationale includes a lower-overlap alternative and explicitly identifies retaining the clinical terminology as a judgement open to disagreement.

**To reverse:** you would be replacing a review step with a number, which is what this replaced.

### PMID 36577095 is the regression case, and it is chosen adversarially

`tests/lib/pipeline.test.ts` runs the real saved page through detection, the checklist and the export. The trial met its non-inferiority criterion for time to sustained clinical recovery (HR 1.17, 95% CI 1.02–1.36, margin 0.8), and no participant in either arm died or progressed to severe Covid-19. So the most tempting summary — non-inferior for preventing severe disease or death — is **false**: that outcome had no events and was never tested.

The test asserts the export carries the caution and cannot produce that claim. Keep it. It is the case where a plausible-sounding conclusion is wrong, which is exactly what this product exists to stop.

### The export never claims something about the paper it cannot know

Spec §4.5 mandates the literal sentence "Absolute effect not reported in the abstract." when no absolute effect could be computed. Shipped as written, it covered two different situations and was false in one of them: an appraisal nobody had filled in produced that sentence for PMID 36577095, whose abstract plainly reports "67.4% vs. 77.3%".

The sentence is now reserved for the case it was written for — a relative effect was recorded and no absolute one, which is the failure mode journal clubs keep repeating. An appraisal with nothing entered says "Absolute effect not calculated in this appraisal." instead, which claims nothing about the study.

This is a deliberate deviation from the literal spec wording, on the principle that a summary someone carries into a journal club must never put words in a paper's mouth. Found by exporting a real appraisal and reading it, not by a test.

The same rule covers the numbers (#58). An NNH worked out from a case-control study's proportions exposed describes the sampling, not an effect, so a Rates or Counts result on that design is exported with the caveat from `src/lib/design-caveats.ts` under it. The caveat is about the design the reader appraised the study as, and says what the number is not. It asserts nothing about what the paper reported.

### Declared permissions track the code, not the roadmap

Two removals in v0.1 follow the same rule, and it is worth stating as a rule because it will come up again: **the manifest describes what this version can actually do.**

- `activeTab` granted nothing the code used.
- `api.anthropic.com` and `api.openai.com` were declared as optional host permissions before any code could request them. A reviewer asking what the extension does with `api.anthropic.com` would have found no answer in the binary. They return with #34/#35 in v0.2; `eutils.ncbi.nlm.nih.gov` stayed because #23 was the near-term use, and #23 now requests it.

Restoring an optional host permission at a version bump is a manifest change, not a re-review of the item, so there is no cost to waiting. `CHROMEWEBSTORE.md` holds the per-permission justification a reviewer asks for and must be updated in the same commit as any manifest change.

### AI extraction: what the code enforces, not the prompt (#34)

`src/lib/ai/` holds the provider-independent contract, the Anthropic client, and the guard that reads its answer. A prompt is a request, not a guarantee, so four things are enforced in code:

- **What is sent.** The request body reads the title, the abstract and the publication types by name, so a caller handing over a whole appraisal still cannot send the user's notes. A test does exactly that and asserts that no note reaches the body. Tags that delimit those fields are defused inside them, so an abstract cannot close its own block.
- **No invented figures.** `groundExtraction` checks the answer against the abstract:
  - A number candidate is kept only if its text appears in the abstract verbatim, whitespace aside, and holds at least two figures.
  - Anywhere else, every figure must appear in the title or the abstract. A limitation or question carrying a computed difference is dropped, and a PICO field is emptied.
  - What it cannot check is whether a real figure is attached to the right group. That stays with the reader, who accepts each candidate.
- **Shape.** Structured output makes the API return the schema, and `parseExtraction` checks it again anyway.
  - A wrong type, or a well-formed empty answer, is a parse failure. It is retried once, then reported, and the UI falls back to manual entry (spec §4.7).
  - A cut-off answer is reported without a retry, since the same budget would cut it off again.
- **When not to send.** An empty or malformed key and a record without a real abstract are refused before any request. The second matters because a model given only a well-known title answers from memory.

The failure kinds are what #35 needs to word its messages. `timeout` is separate from `aborted`, because a cancel shows nothing and a timeout has to say so. `forbidden` is Anthropic's HTTP 403, not a declined browser permission.

The default model is Claude Sonnet 5, at about a cent a run. Opus 5.5 is the other choice. Haiku 4.5 is left out although it is cheaper: its retirement date is "not sooner than October 15, 2026", and a stored setting pointing at a retired model fails every run. Model ids and prices are hard-coded in `anthropic.ts`, checked against Anthropic's docs on 2026-09-26. Recheck them whenever a model is retired.

**Not in #34, on purpose:**

- The optional host permission for `api.anthropic.com`. No entrypoint imports `src/lib/ai/` yet, so the shipped build contains none of it, and declaring the host now would repeat what the section above removed.
  - It lands with the UI in #35, together with the key and model settings, `check:manifest` and `CHROMEWEBSTORE.md`.
  - #35 should first check whether it is needed at all. The browser-access header exists so that Anthropic answers cross-origin requests, and an extension page can fetch a CORS-enabled origin without a host permission. If that works, declaring nothing is the better answer.
- A test against the real API. The acceptance run with a real key is manual and has not been done.

### Monetization: validate the workflow before billing (#37, #36)

The 2026-09-27 strategy revision in spec §4.8 and §7–§11 supersedes the earlier AI-only paid plan and the assumption of a sale within 12–18 months. Publish the free MVP and observe actual journal-club preparation first. Keep existing free features available. Test one editable presentation-export template as the paid value; BYOK AI is optional assistance, not the only reason to pay. Neither paid exports nor billing is implemented.

The first price to test is `$39/year`, an unvalidated hypothesis replacing `$4/month` and `$29/year`. Use the spec's small-cohort completion, repeat-use and actual-purchase gates. Do not treat store installs or local counters as a measured conversion funnel. The extension still has no telemetry, and the current privacy policy continues to describe the shipped free version.

ExtensionPay is a candidate, not a dependency selected for implementation. Check current fees, payment restoration, refunds and transfer options before billing goes live. A transferability question must not block free release or demand validation; do not build a custom Stripe licensing backend solely for a hypothetical sale. Billing will require updated network, privacy and permission disclosures.

The issues were brought in line with the revised spec on 2026-09-27.

- **#35:** AI is an optional free beta, not gated on a licence.
- **#39:** the Pro candidate is one PPTX template, moved to v0.2 and mocked up by hand before any code.
- **#36:** billing comes after #39.
- **#37:** records the provider's terms instead of deciding a custom fallback.
- **#38 and #40:** off the v1.0 milestone, as backlog.
- **#32:** now the first cohort and the §8.1 gates, with `docs/LAUNCH.md` as its guide.

The historical weekly log records the former decision to block the AI panel on billing; that is no longer the roadmap dependency.

### English only until after v1.0 (#41)

Most of the translation cost is the 55 checklist questions and their help text, which are the core IP and were written from scratch in English. Translating them well needs the English wording to have been used in anger first; translating early risks locking in phrasing that is wrong in both languages.

### The repository moves to a dedicated org before the store submission (#30, #31)

Today the repository URL appears in exactly one shipped place, `src/ui/options/OptionsPage.tsx`. After submission it is also in the store listing and the published privacy policy, and changing it there means a re-review. Branch protection is a repository setting and does not survive a transfer, so re-apply it on the other side.

**Done 2026-11-15, by publishing a new repository rather than transferring this one.** 67 of the 93 commits carried the owner's personal e-mail as author, and GitHub keeps every pull request's commits under `refs/pull/N/head`, which nobody but GitHub Support can delete. Rewriting history and then publishing the same repository would have left the address one `/pull/N.patch` away. So:

- The original repository was moved into the organization as `journal-club-helper-archive` and stays private. It keeps the old commit IDs and the pull requests' review discussion.
- `pharm-pubmed/journal-club-helper` was created from a copy of `main` and the `v0.1.0` tag with author and committer e-mail rewritten to the GitHub noreply address (`git filter-branch --env-filter`). Every tree is unchanged, so the code and the v0.1.0 zip are byte for byte what was tested; only commit IDs differ (`0fdb3af` → `d6b84f1` for v0.1.0).
- Numbers were kept. Issues #1–#70 were recreated in order: every issue was transferred with its comments, labels and milestone, and each pull-request number got a closed, locked issue naming the rewritten merge commit. So every `#nn` in these documents still means the same thing.
- The v0.1.0 release was recreated with the same zip and notes, with the commit IDs updated.
- Local clones from before 2026-11-15 have the old history: clone again rather than pulling. The repository's local `user.email` is now the noreply address, so new commits do not reintroduce the personal one.

### No custom domain for now — decided 2026-11-15

The landing page and the privacy policy are served from the organization's GitHub Pages URL, and the contact address is a Gmail address on the dedicated Google account. The store asks for a privacy policy URL, not a domain, and a free cohort of ten does not need one. Both the Pages URL and the mailbox move with the organization and the Google account, so the transfer argument of spec §10 still holds.

What it costs: the URL names GitHub, not the product, and changing it later means a re-review of the listing and a new policy URL. Reverse this before the public launch if the listing's look matters, or before billing, where a stable address on receipts does. Adding a domain then is a Pages setting plus DNS records; the site already uses relative links.
