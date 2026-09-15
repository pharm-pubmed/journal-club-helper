# Journal Club Helper: Critical Appraisal for PubMed

A Chrome extension (Manifest V3) that adds a structured critical-appraisal workflow to PubMed abstract pages: study design detection, PICO, ARR / RRR / NNT with 95% CI, design-specific validity checklists, and a one-page journal club summary.

It does **not** summarize papers. It provides the appraisal template and fills it in with you.

## Status

Pre-alpha. Work is tracked in GitHub issues and milestones (v0.1 MVP → v0.2 Paid features → v0.3 Public release → v1.0).

## Positioning

- For medical residents, pharmacy residents (PGY1/2), medical students, and nurse practitioners preparing journal club.
- Educational and appraisal aid only. Not a clinical decision-support tool. No recommendations are generated.
- No servers, no accounts, no analytics. Everything runs locally in the browser. AI features (v0.2) call the provider directly with the user's own API key.
- Not affiliated with NLM / NIH. PubMed is a registered trademark of the U.S. National Library of Medicine.

## Documents

- [docs/SPEC.ja.md](docs/SPEC.ja.md) — product spec. Japanese by design; it is the only Japanese document in this repo. Code, commits, UI copy, and all other docs are English.
- [docs/HANDOVER.md](docs/HANDOVER.md) — accounts, build and release procedures, known issues, external dependencies. Updated at the end of every milestone week.
- `docs/PRIVACY.md`, `docs/STORE-LISTING.md` — added for v0.3.

## Development

Tooling is set up in the "Project scaffold" issue. Planned stack: WXT, TypeScript, Preact, Vitest, Playwright, pnpm. Until the scaffold lands there is nothing to build.

## Permissions

Kept to the minimum in the spec: `storage`, `sidePanel`, `activeTab`, host permission for `pubmed.ncbi.nlm.nih.gov` only. E-utilities and AI providers are optional host permissions requested when the user enables the feature. No `tabs`, no `<all_urls>`, no `scripting`.

## Disclaimer

Generated with Journal Club Helper for educational purposes. Verify against the full text.
