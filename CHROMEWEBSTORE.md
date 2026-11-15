# Chrome Web Store submission record

Everything a reviewer asks for, kept next to the code so it cannot drift from what actually ships. Update it in the same commit as any manifest change.

The permission arrays below are enforced, not described: `scripts/check-manifest.mjs` fails CI if the built manifest differs from them by one entry. See `docs/HANDOVER.md` §7 for the reasoning behind each decision.

- **Item:** Journal Club Helper: Critical Appraisal
- **Version:** 0.3.0 (not yet submitted; the first store submission)
- **Minimum Chrome version:** 116 — `chrome.sidePanel.open()` is not available before it
- **Listing text and assets:** [docs/STORE-LISTING.md](docs/STORE-LISTING.md), `store/` (#27) · **Privacy policy:** [docs/PRIVACY.md](docs/PRIVACY.md) (#28) · **Submission:** #31

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

Requested at runtime through `chrome.permissions.request`, only when the user asks for the feature that needs it, never at install.

| Host                                | Feature                                                         | Status                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://eutils.ncbi.nlm.nih.gov/*` | NCBI E-utilities fallback when the page markup cannot be parsed | Requested when the user clicks "Fetch from NCBI" on a page the extension could not read (#23). Sends the PMID, the tool name and the project's contact address, nothing the user wrote. |

The AI provider hosts (`api.anthropic.com`, `api.openai.com`) were declared here and have been **removed** until the feature that uses them ships in 0.2 (#34, #35). Declaring a host no code path can reach leaves a reviewer's question — "what does this extension do with `api.anthropic.com`?" — with no answer in the binary. Same reasoning that removed `activeTab`. Restoring them at 0.2 is a manifest change at a version bump, not a re-review of the item.

## Data handling

For the store's data-use disclosure form. The store's User Data FAQ says handling has to be disclosed "even when data is processed or stored locally on a user's device and is not transmitted", so the categories below are ticked for what the extension keeps on the device, not for anything it sends to the developer. It sends the developer nothing.

**Tick these three:**

- **Website content.** The extension reads the abstract, citation, publication types and MeSH terms from the PubMed page the user is viewing. It stores the citation, the detected design with its evidence, and the abstract sentence behind any number the user works with. When the user asks, it sends the page's PMID to NCBI E-utilities.
- **Web history.** Each saved appraisal records which article it is for (PMID and title) and when it was created and last edited. Together they are a local list of the articles the user worked on.
- **User activity.** Three local counters record how many articles were opened in the panel, how many summaries were exported and how many AI runs there were. They are shown back to the user on the settings page.

**Leave the rest unticked:** personally identifiable information, health information (the extension reads published abstracts, not anyone's health data, and the user's notes never leave the device), financial and payment information, authentication information, personal communications and location.

**Certifications, all three true:** the data is not sold to third parties, not used or transferred for purposes unrelated to the single purpose, and not used or transferred to determine creditworthiness or for lending.

The extension makes **one network request of its own, and only on request**. When a PubMed page cannot be read, the panel offers to fetch the same record from NCBI E-utilities. Nothing is sent until the user clicks that offer, and the first time also grants the optional host permission. The request carries the PMID of the page, the database and format parameters and the tool name `journal-club-helper`, the project's contact address `journal.club.helper@gmail.com` that NCBI asks for, plus what any HTTPS request carries (IP address, user agent, the extension's origin). None of the user's own notes or answers are in it.

When the AI features ship this section has to be rewritten: the abstract text, title and publication types would be sent to the provider the user chose, with the user's own API key, and the user's own notes would still never be sent. Billing would add its own requests and data. Update `docs/PRIVACY.md` in the same change, and publish it before the release.

## Remote code

None. No `eval`, no remotely hosted scripts, no CDN. Everything executed is in the package; the build is a static bundle produced by `pnpm build` (WXT + Vite) with `preact` as the only runtime dependency.

## Content and rating

- Educational tool for clinicians and health-professions students. No user-generated content, no social features, no ads.
- The output carries a fixed line: "Generated with Journal Club Helper for educational purposes. Verify against the full text."
- Not affiliated with the U.S. National Library of Medicine, the NIH or HHS. The PubMed wordmark and logo are registered trademarks of the U.S. Department of Health and Human Services, according to PubMed's own disclaimer. The listing must not imply endorsement. The name describes the site the tool works on.
- The validity checklists are original text written for this product, not reproduced from CASP, JBI, CONSORT, STROBE, PRISMA or QUADAS. A test (`tests/lib/checklist-schema.test.ts`) compares every shipped question against a corpus of those instruments' wording and fails CI on a near match.

## Reviewer notes (the dashboard's test instructions tab)

> The extension runs only on `https://pubmed.ncbi.nlm.nih.gov/<PMID>/`, for example https://pubmed.ncbi.nlm.nih.gov/36740866/. On such a page it adds one button next to the Abstract heading, and the toolbar icon also opens it. Clicking either opens a side panel containing an appraisal form the user fills in. It holds two permissions, `storage` and `sidePanel`, plus one host permission for PubMed. Everything it stores stays in `chrome.storage.local` on the device; it has no server and sends the developer nothing. Its only network request, to NCBI E-utilities, is made when a page cannot be read and the user asks for it and grants the optional permission; it sends the PMID. No login or test account is needed. Source: TBD(#30), the public repository.
