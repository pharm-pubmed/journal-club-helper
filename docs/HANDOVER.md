# Handover

Everything a new owner needs to build, release, and operate this extension. Started on day one and updated at the end of every milestone week (spec §10, §12). Keep it current; it is part of the asset if the project is sold.

## 1. Accounts

| Service | Account | Status | Notes |
|---|---|---|---|
| GitHub repository | `piroshi1989/journal-club-helper` | personal account | Spec §10 requires a dedicated GitHub Org. Transfer the repo once the org exists (tracked in issues). |
| Google account (Chrome Web Store developer) | — | not created | Must be a dedicated account, never the personal one. Needed before v0.3 submission. |
| Domain (landing page, privacy policy) | — | not registered | Use a registrar that makes transfer easy. |
| ExtensionPay / Stripe | — | not created | v0.2. Check transferability before committing (spec §10). |
| Anthropic / OpenAI | none | n/a | Users bring their own API keys. The project holds no provider account. |
| Bank account for revenue / costs | — | not created | Keep separate from personal finances. |

## 2. Build

Not available yet. Filled in when the project scaffold lands (WXT + pnpm). Expected commands: `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm zip`, `pnpm test`, `pnpm test:e2e`.

## 3. Release

Not available yet. Filled in for v0.3 (Chrome Web Store submission steps, version bump, changelog, zip upload, review notes).

## 4. Known issues

None yet.

## 5. External dependencies

| Dependency | Why | Risk | Mitigation |
|---|---|---|---|
| PubMed abstract page DOM (`pubmed.ncbi.nlm.nih.gov/<PMID>/`) | Source of abstract text, publication types, MeSH, citation | Markup can change without notice | E-utilities fallback; weekly Playwright smoke run in CI |
| NCBI E-utilities `efetch` | Fallback when DOM parsing fails | Rate limit ≤ 3 req/s without key; requires tool name + email in User-Agent | Optional host permission, requested only when enabled |
| ExtensionPay (v0.2) | Billing | Transferability on sale unknown | `src/lib/license.ts` abstraction; Stripe Checkout + license key as fallback |
| Anthropic / OpenAI APIs (v0.2) | AI extraction with user's key | API changes, cost | Provider abstraction; prompts in `src/prompts/*.md` |
| Chrome Side Panel API | Panel UI | Requires Chrome 114+ (`sidePanel.open()` 116+) | Set `minimum_chrome_version` accordingly; verify on Edge / Brave |

## 6. Weekly log

- 2026-09-15: Repository created. Spec committed to `docs/SPEC.ja.md`. Milestones, labels, and issues filed for v0.1 through v1.0.
