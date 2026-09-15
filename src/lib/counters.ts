/**
 * Local usage counters (issue #22, SPEC.ja.md §7).
 *
 * The MVP ships no external analytics: the panel counts locally and the options
 * page shows the same numbers back to the user.
 */
import { loadSettings, saveSettings } from './storage';
import type { CounterName } from './types';

/**
 * Increments are read-modify-write on one `settings` record, so two callers in
 * the same tick (panel mount plus an export, say) would both read the old value
 * and one count would vanish. Chaining onto a single in-flight promise makes
 * every increment wait its turn.
 */
let queue: Promise<void> = Promise.resolve();

async function applyIncrement(name: CounterName): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({
    ...settings,
    counters: { ...settings.counters, [name]: settings.counters[name] + 1 },
  });
}

export function incrementCounter(name: CounterName): Promise<void> {
  const run = queue.then(
    () => applyIncrement(name),
    // A failed write (quota, for one) must not stall every later increment.
    () => applyIncrement(name),
  );
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Resolves once every queued increment has settled. */
export function countersSettled(): Promise<void> {
  return queue;
}
