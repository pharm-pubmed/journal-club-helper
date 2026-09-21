# Chrome Web Store submission record

Everything a reviewer asks for, kept next to the code so it cannot drift from what actually ships. Update it in the same commit as any manifest change.

The permission arrays below are enforced, not described: `scripts/check-manifest.mjs` fails CI if the built manifest differs from them by one entry. See `docs/HANDOVER.md` §7 for the reasoning behind each decision.

- **Item:** Journal Club Helper: Critical Appraisal for PubMed
- **Version:** 0.1.0 (not yet submitted)
- **Minimum Chrome version:** 116 — `chrome.sidePanel.open()` is not available before it
- **Listing assets:** #27 · **Privacy policy:** #28 · **Submission:** #31

## Single purpose

Attach a structured critical-appraisal workflow to a PubMed abstract page: detect the study design, record PICO, compute the absolute effect (ARR, RRR, NNT with a 95% CI), work through a design-specific validity checklist, and export a one-page summary.

It does not summarize papers and it produces no clinical recommendation. Every judgement in the output is typed by the user.

## Permission justifications

| Permission                                 | Why it is needed                                                                                                                                                                                                                                                                                                                 | What it is not used for                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                  | Saves the appraisal the user is writing, keyed by PMID, so closing the panel or switching tabs does not lose their work. Also holds three local usage counters shown back to the user on the options page. `chrome.storage.local` only — an ESLint rule bans `chrome.storage.sync` repo-wide so nothing can sync off the device. | No identifiers, no analytics, nothing transmitted.                                                                                      |
| `sidePanel`                                | The entire user interface is a side panel. The extension puts one button on the PubMed page; everything else happens in the panel.                                                                                                                                                                                               | —                                                                                                                                       |
| `https://pubmed.ncbi.nlm.nih.gov/*` (host) | The content script reads the already-rendered abstract, publication types, MeSH terms and citation from the page the user is looking at, and injects the single button that opens the panel.                                                                                                                                     | No other site is read or contacted. The content script only runs on `pubmed.ncbi.nlm.nih.gov/<PMID>/`; search-result pages are ignored. |

### Permissions deliberately **not** requested

Worth stating in the review notes, because it is unusual and it is verifiable from the source:

- **`tabs`** — not needed. `chrome.tabs.query` works without it, and `Tab.url` is populated only for hosts the extension already holds a permission for, which is exactly the PubMed-only behaviour wanted.
- **`activeTab`** — was in the original spec and **removed** after manual testing confirmed it granted nothing the extension used.
- **`scripting`**, **`<all_urls>`**, **`unlimitedStorage`**, **`webRequest`**, **`cookies`**, **`history`** — none used. All are on the CI guard's forbidden list.

### Optional host permissions

Requested at runtime through `chrome.permissions.request`, only when the user turns the matching feature on, never at install.

| Host                                | Feature                                                         | Status                                     |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `https://eutils.ncbi.nlm.nih.gov/*` | NCBI E-utilities fallback when the page markup cannot be parsed | Not implemented yet (#23, planned for 0.3) |

The AI provider hosts (`api.anthropic.com`, `api.openai.com`) were declared here and have been **removed** until the feature that uses them ships in 0.2 (#34, #35). Declaring a host no code path can reach leaves a reviewer's question — "what does this extension do with `api.anthropic.com`?" — with no answer in the binary. Same reasoning that removed `activeTab`. Restoring them at 0.2 is a manifest change at a version bump, not a re-review of the item.

## Data handling

For the store's data-use disclosure form:

- **Personally identifiable information:** none collected.
- **Health information:** none collected. The extension reads published abstracts, not patient data, and the user's own notes never leave the device.
- **Financial, authentication, personal communications, location, web history, user activity:** none collected.
- **Website content:** read locally from the PubMed page the user is viewing, to populate the appraisal form. Not transmitted.
- **Sold to third parties:** no. **Used or transferred for purposes unrelated to the single purpose:** no. **Used or transferred to determine creditworthiness:** no.

In 0.1.0 the extension makes **no network request of any kind**. The options page states this to the user and invites them to confirm it in the Network tab. When the AI features land in 0.2 this section has to be rewritten: the abstract text, title and publication types would be sent to the provider the user chose, with the user's own API key, and the user's own notes would still never be sent.

## Remote code

None. No `eval`, no remotely hosted scripts, no CDN. Everything executed is in the package; the build is a static bundle produced by `pnpm build` (WXT + Vite) with `preact` as the only runtime dependency.

## Content and rating

- Educational tool for clinicians and health-professions students. No user-generated content, no social features, no ads.
- The output carries a fixed line: "Generated with Journal Club Helper for educational purposes. Verify against the full text."
- Not affiliated with the U.S. National Library of Medicine or the NIH. PubMed is a registered trademark of the NLM; the listing must not imply endorsement. The name is descriptive of the page the tool works on.
- The validity checklists are original text written for this product, not reproduced from CASP, JBI, CONSORT, STROBE, PRISMA or QUADAS. A test (`tests/lib/checklist-schema.test.ts`) compares every shipped question against a corpus of those instruments' wording and fails CI on a near match.

## Reviewer notes (paste into the submission form)

> The extension runs only on `https://pubmed.ncbi.nlm.nih.gov/<PMID>/`. On such a page it adds one button next to the Abstract heading; clicking it opens a side panel containing an appraisal form the user fills in. It holds two permissions, `storage` and `sidePanel`, plus one host permission for PubMed. It makes no network requests and collects no data. Source: https://github.com/piroshi1989/journal-club-helper
