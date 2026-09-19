// Guards SPEC.ja.md §5: the shipped permission set is fixed.
// CI fails if the built manifest drifts, so a stray "tabs" or "scripting" can
// never reach the Chrome Web Store unnoticed (issue #3).
import { readFile } from 'node:fs/promises';

const MANIFEST = '.output/chrome-mv3/manifest.json';

const EXPECTED = {
  // activeTab was dropped after the #25 manual QA: it is provably unused and one
  // fewer permission is worth having at store review. See HANDOVER §7.
  permissions: ['storage', 'sidePanel'],
  host_permissions: ['https://pubmed.ncbi.nlm.nih.gov/*'],
  // The AI provider hosts return with the v0.2 features that request them (#34,
  // #35). Declaring a host the code cannot reach is a question at review with no
  // answer in the binary. See CHROMEWEBSTORE.md.
  optional_host_permissions: ['https://eutils.ncbi.nlm.nih.gov/*'],
};

const FORBIDDEN = [
  'tabs',
  'scripting',
  '<all_urls>',
  'webRequest',
  'cookies',
  'history',
  'activeTab',
];

const sorted = (xs) => [...(xs ?? [])].sort();
const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const problems = [];

for (const [key, expected] of Object.entries(EXPECTED)) {
  if (!eq(manifest[key], expected)) {
    problems.push(
      `${key} drifted.\n  expected: ${JSON.stringify(sorted(expected))}\n  actual:   ${JSON.stringify(sorted(manifest[key]))}`,
    );
  }
}

const everything = [
  ...(manifest.permissions ?? []),
  ...(manifest.optional_permissions ?? []),
  ...(manifest.host_permissions ?? []),
  ...(manifest.optional_host_permissions ?? []),
  ...(manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? []),
];
for (const entry of everything) {
  if (FORBIDDEN.includes(entry)) problems.push(`forbidden permission present: ${entry}`);
}

if (manifest.minimum_chrome_version !== '116') {
  problems.push(
    `minimum_chrome_version must be "116" (issue #1 B6), got ${manifest.minimum_chrome_version}`,
  );
}

if (problems.length > 0) {
  console.error('Manifest guard failed (SPEC.ja.md §5):\n\n' + problems.join('\n\n'));
  process.exit(1);
}

console.log('Manifest guard passed: permissions match the spec exactly.');
