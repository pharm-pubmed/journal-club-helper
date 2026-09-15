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

None yet.

## 5. External dependencies

| Dependency                                                   | Why                                                        | Risk                                                                       | Mitigation                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| PubMed abstract page DOM (`pubmed.ncbi.nlm.nih.gov/<PMID>/`) | Source of abstract text, publication types, MeSH, citation | Markup can change without notice                                           | E-utilities fallback; weekly Playwright smoke run in CI                        |
| NCBI E-utilities `efetch`                                    | Fallback when DOM parsing fails                            | Rate limit ≤ 3 req/s without key; requires tool name + email in User-Agent | Optional host permission, requested only when enabled                          |
| ExtensionPay (v0.2)                                          | Billing                                                    | Transferability on sale unknown                                            | `src/lib/license.ts` abstraction; Stripe Checkout + license key as fallback    |
| Anthropic / OpenAI APIs (v0.2)                               | AI extraction with user's key                              | API changes, cost                                                          | Provider abstraction; prompts in `src/prompts/*.md`                            |
| Chrome Side Panel API                                        | Panel UI                                                   | `sidePanel.open()` needs Chrome 116+ and a user gesture                    | `minimum_chrome_version` is `"116"` and CI enforces it; verify on Edge / Brave |

## 6. Weekly log

- 2026-09-15: Repository created. Spec committed to `docs/SPEC.ja.md`. Milestones, labels, and issues filed for v0.1 through v1.0.
