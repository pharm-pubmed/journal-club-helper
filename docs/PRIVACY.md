# Privacy policy

- **Extension:** Journal Club Helper: Critical Appraisal for PubMed (the "extension").
- **Status:** draft, not yet published. It describes the extension as it will be submitted to the Chrome Web Store, which includes the NCBI fallback described below.
- **Effective date:** TBD(#29), set on the day this policy is first published.
- **Contact:** TBD(#30), the project's own address.

## In short

The extension has no server and no account, and it contains no analytics. What you write stays in your browser, on your device. The extension makes one network request of its own, and only when you ask for it: fetching a PubMed record from NCBI when a page could not be read. That request carries the article's PubMed ID (PMID). It contains nothing you wrote.

## What is stored, and where

Everything is kept in your browser's extension storage (`chrome.storage.local`) on the device you use. It is never synced to your Google account or to other devices. The extension does not use `chrome.storage.sync`, and a lint rule that the project's automated checks run rejects the usual ways of calling it.

| What              | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Limit                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Appraisals        | One per article you work on, keyed by PMID. The article's citation (title, authors, journal, year, PMID, DOI). The study design the extension detected, with the publication types and abstract phrases it used. What you entered: PICO, the numbers you worked with (including the sentence of the abstract a number came from), checklist answers and notes, facts such as funding that you recorded, and your bottom line. When you created and last edited it. | 500 appraisals. The one you edited least recently is removed first. 64 KB per appraisal. |
| Usage counts      | Three numbers, shown to you on the extension's settings page: how many articles you opened in the side panel, how many summaries you exported, and how many AI extractions ran. There are no AI features in this version, so the last one stays at 0 unless a backup you import says otherwise.                                                                                                                                                                    | —                                                                                        |
| Set-aside records | A saved appraisal that a later version of the extension cannot read. It is moved under its own key instead of being overwritten.                                                                                                                                                                                                                                                                                                                                   | —                                                                                        |

Your appraisals are, in effect, a list of the articles you have worked on and when. That list stays on your device.

The extension reads the PubMed abstract page you are viewing (title, abstract, publication types, MeSH terms and citation) to fill in the appraisal form. It reads it in your browser and does not send it anywhere. The parts listed above are saved with your appraisal. It runs on `https://pubmed.ncbi.nlm.nih.gov/` only, and ignores search result pages.

## What is never collected or sent

- No analytics, telemetry, crash reporting or usage tracking of any kind. The usage counts above never leave your browser unless you export them yourself.
- No personal information, health information, location or account data.
- No cookies, advertising identifiers or fingerprinting.
- Nothing is sold, and nothing is used for any purpose other than the appraisal form described above. The only thing shared with anyone is the NCBI request described below, when you ask for it.

## Network requests

### NCBI E-utilities, only when you ask

If the extension cannot read a PubMed abstract page, for example after PubMed changes its layout, the side panel offers to fetch the same record from NCBI's E-utilities service (`https://eutils.ncbi.nlm.nih.gov`) instead.

- Nothing is sent until you click **Fetch from NCBI**. The first time, your browser also asks you to allow the extension to access that site. If you decline, nothing is sent.
- The request contains the article's PMID, the name of the database and the format asked for, and the extension's name (`journal-club-helper`). NCBI asks tools to identify themselves this way. A contact address for the project may be added once it exists. It is the project's address, never yours.
- Like any web request, it also reveals your IP address, your browser's user agent and the extension's identifier to NCBI. NCBI's policies apply to that: <https://www.ncbi.nlm.nih.gov/home/about/policies/>.
- None of your notes, answers or other appraisals are sent.

You can withdraw the permission in your browser's extension settings: open `chrome://extensions`, choose **Details** for the extension, and remove its access to that site.

### AI providers: not in this version

This version sends nothing to any AI provider. A later version may add optional AI extraction that runs with your own API key. If it does, this policy will be updated before that version is released. It will name the provider and say exactly what is sent.

### Links you choose to open

The side panel and the settings page contain a few links: the article's PubMed page, the Cochrane Handbook and CEBM pages that explain the calculations, and the project's pages. Clicking one opens that site in a new tab, as any link does, and that site's own privacy policy applies. The extension sends nothing with the click.

### Nothing else

The settings page makes no network requests. Copying a summary uses your clipboard, and downloading one or exporting a backup saves a file to your computer. Importing a backup reads a file you choose. All of this happens in your browser, and nothing is uploaded.

## Keeping, exporting and deleting your data

- **Export:** Settings → **Export all** saves every appraisal and your usage counts to a JSON file on your computer. Set-aside records are not included.
- **Delete:** Settings → **Delete all appraisals** removes every saved appraisal from this browser, set-aside records included. Your usage counts are kept. It cannot be undone, but copies you exported or downloaded yourself are not affected.
- **Uninstall:** removing the extension deletes everything it stored, usage counts included.

There is no server copy to request, correct or delete. Everything the extension holds is on your device and under your control.

## Children

The extension is meant for clinicians and students in the health professions. It is not directed at children, and it collects no personal information from anyone.

## Chrome Web Store User Data Policy

The use of information received through this extension adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Not affiliated with NLM, NIH or HHS

The extension is an independent educational tool. It is not affiliated with or endorsed by the U.S. National Library of Medicine, the National Institutes of Health or the U.S. Department of Health and Human Services. The PubMed wordmark and logo are registered trademarks of the U.S. Department of Health and Human Services.

## Changes to this policy

Any change is recorded below and in the project's public history, and takes effect when the version that needs it is released. A change that stores or sends more data, or sends it somewhere new, is always made before the version that does so ships.

| Date     | Change                  |
| -------- | ----------------------- |
| TBD(#29) | First published policy. |
