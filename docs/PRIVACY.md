# Privacy policy

**Journal Club Helper: Critical Appraisal for PubMed** (the "extension")

- **Status:** draft, not yet published. It describes the extension as it is on `main`.
- **Effective date:** TBD(#29), set on the day this policy is first published.
- **Contact:** TBD(#30), the project's own address.

## In short

The extension has no server and no account, and it contains no analytics. What you write stays in your browser, on your device. The extension makes one kind of network request, and only when you ask for it: fetching a PubMed record from NCBI when a page could not be read. That request carries the article's PubMed ID (PMID). It contains nothing you wrote.

## What is stored, and where

Everything is kept in your browser's extension storage (`chrome.storage.local`) on the device you use. It is never synced to your Google account or to other devices. The code does not use `chrome.storage.sync`, and a build check rejects any code that does.

| What               | Contents                                                                                                                                                                                                          | Limit                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Appraisals         | One per article, keyed by PMID. The article's citation (title, authors, journal, year, PMID, DOI), the detected study design, and what you entered: PICO, numbers, checklist answers, notes and your bottom line. | 500 appraisals. The one you edited least recently is removed first. 64 KB per appraisal. |
| Usage counts       | Three numbers: how often the side panel was opened, how often a summary was exported, and how often AI extraction ran (always 0 in this version). They are shown to you in the extension's settings.              | —                                                                                        |
| Unreadable records | A saved appraisal that a later version cannot read. It is set aside under its own key instead of being overwritten.                                                                                               | —                                                                                        |

The extension reads the PubMed abstract page you are viewing (title, abstract, publication types, MeSH terms and citation) to fill in the appraisal form. It reads it in your browser and does not send it anywhere. It runs on `https://pubmed.ncbi.nlm.nih.gov/` only, and ignores search result pages.

## What is never collected

- No analytics, telemetry, crash reporting or usage tracking of any kind.
- No personal information, health information, browsing history, location or account data.
- No cookies, advertising identifiers or fingerprinting.
- Nothing is sold, shared with third parties, or used for any purpose other than the appraisal form described above.

## Network requests

### NCBI E-utilities, only when you ask

If the extension cannot read a PubMed abstract page, for example after PubMed changes its layout, the side panel offers to fetch the same record from NCBI's E-utilities service (`https://eutils.ncbi.nlm.nih.gov`) instead.

- Nothing is sent until you click **Fetch from NCBI**. The first time, your browser also asks you to grant the extension access to that site. If you decline, nothing is sent.
- The request contains the article's PMID and the extension's name (`journal-club-helper`). NCBI asks tools to identify themselves this way. A contact address for the project may be added once it exists. It is the project's address, never yours.
- Like any web request, it also reveals your IP address and your browser's user agent to NCBI. NCBI's own privacy policy applies to that: <https://www.ncbi.nlm.nih.gov/home/about/policies/>.
- None of your notes, answers or other appraisals are sent.

You can withdraw the permission at any time. Open `chrome://extensions`, choose **Details** for the extension, and remove the site access.

### AI providers: not in this version

This version sends nothing to any AI provider. A later version may add optional AI extraction that runs with your own API key. If it does, this policy will be updated before that version is released. It will name the provider and say exactly what is sent.

### Nothing else

The settings page makes no network requests. Copying a summary uses your clipboard, and downloading one or exporting a backup saves a file to your computer. Importing a backup reads a file you choose. All of this happens in your browser, and nothing is uploaded.

## Keeping, exporting and deleting your data

- **Export:** Settings → **Export all** saves every appraisal and your usage counts to a JSON file on your computer.
- **Delete:** Settings → **Delete all appraisals** removes every saved appraisal from this browser. It cannot be undone, because no other copy exists.
- **Uninstall:** removing the extension deletes everything it stored.

There is no server copy to request, correct or delete. Everything the extension holds is on your device and under your control.

## Children

The extension is meant for clinicians and students in the health professions. It is not directed at children, and it collects no personal information from anyone.

## Chrome Web Store User Data Policy

The use of information received through this extension adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Not affiliated with NLM / NIH

The extension is an independent educational tool. It is not affiliated with or endorsed by the U.S. National Library of Medicine or the National Institutes of Health. PubMed is a registered trademark of the NLM.

## Changes to this policy

Any change is recorded below and in the project's public history, and takes effect when the version that needs it is released. A change that sends more data, or sends it somewhere new, is always made before the version that does so ships.

| Date     | Change                  |
| -------- | ----------------------- |
| TBD(#29) | First published policy. |
