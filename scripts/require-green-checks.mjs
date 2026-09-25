// Claude Code PreToolUse hook (.claude/settings.json): refuses `gh pr merge`
// unless every check on the PR's head commit has passed.
//
// It stands in for branch protection, which GitHub does not offer on a private
// repository owned by a free personal account (the API answers 403). It only
// covers merges an agent runs through this checkout; the merge button on
// github.com is not guarded. See HANDOVER §2.
//
// Fails closed: if the checks cannot be read, the merge is refused.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// `gh pr merge` flags that take a value, so the value is not mistaken for the PR.
const VALUE_FLAGS = new Set([
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-t',
  '--subject',
  '-A',
  '--author-email',
  '--match-head-commit',
  '-R',
  '--repo',
]);

// A check run passes when it completed with one of these; a commit status when
// its state is SUCCESS. Anything else, including in progress, blocks.
const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

/** Splits a shell fragment into words, honouring single and double quotes. */
function words(fragment) {
  const out = [];
  let cur = '';
  let quote = null;
  let inWord = false;
  for (const ch of fragment) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) out.push(cur);
      cur = '';
      inWord = false;
    } else {
      cur += ch;
      inWord = true;
    }
  }
  if (inWord) out.push(cur);
  return out;
}

/**
 * Every `gh pr merge` in a command line, as the arguments `gh pr view` needs to
 * find the same PR: the selector (absent means the current branch) and `-R`.
 */
function findMerges(command) {
  const merges = [];
  const re = /(?:^|[;&|(\s])gh\s+pr\s+merge\b([^;&|)\n]*)/g;
  for (const m of command.matchAll(re)) {
    const args = words(m[1]);
    let selector = null;
    let repo = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-R' || a === '--repo') repo = args[++i] ?? null;
      else if (a.startsWith('--repo=')) repo = a.slice('--repo='.length);
      else if (VALUE_FLAGS.has(a)) i++;
      else if (!a.startsWith('-') && selector === null) selector = a;
    }
    merges.push({ selector, repo });
  }
  return merges;
}

/** Why the rollup does not allow a merge, or null when it does. */
function blockingReason(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) {
    return 'no checks have reported on the head commit yet';
  }
  const bad = rollup.filter((c) =>
    c.__typename === 'StatusContext'
      ? c.state !== 'SUCCESS'
      : c.status !== 'COMPLETED' || !PASSING_CONCLUSIONS.has(c.conclusion),
  );
  if (bad.length === 0) return null;
  return bad
    .map((c) => {
      const name = c.name ?? c.context ?? 'unnamed';
      const result = c.__typename === 'StatusContext' ? c.state : c.conclusion || c.status;
      return `${name}: ${result}`;
    })
    .join(', ');
}

function checkMerge({ selector, repo }) {
  const args = ['pr', 'view'];
  if (selector) args.push(selector);
  if (repo) args.push('--repo', repo);
  args.push('--json', 'number,statusCheckRollup');
  const label = selector ? `PR ${selector}` : 'the PR for the current branch';
  let pr;
  try {
    pr = JSON.parse(
      execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  } catch (err) {
    const detail = String(err.stderr || err.message).trim();
    return `could not read the checks for ${label} (${detail})`;
  }
  const reason = blockingReason(pr.statusCheckRollup);
  return reason && `PR #${pr.number} is not green: ${reason}`;
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input.tool_input?.command ?? '';
  for (const merge of findMerges(command)) {
    const reason = checkMerge(merge);
    if (reason) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              `Merge refused: ${reason}. CI must pass before merging ` +
              '(stand-in for branch protection, see HANDOVER §2). ' +
              'Wait with `gh pr checks <pr> --watch` or fix the failure.',
          },
        }),
      );
      return;
    }
  }
}

main();
