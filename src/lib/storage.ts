/**
 * Per-PMID persistence, settings and JSON export/import (issue #18, SPEC.ja.md §4.6).
 *
 * Everything lives in `chrome.storage.local` behind the `KeyValueStore` seam;
 * `chrome.storage.sync` is forbidden repo-wide because v0.2 keeps the user's API
 * key in Settings.
 *
 * Layout:
 *   appraisal:<PMID>  one Appraisal
 *   settings          one Settings
 */
import { getStore } from './kv-store';
import type {
  Appraisal,
  CitationFields,
  CounterName,
  ItemAnswer,
  Settings,
  ValidityAnswers,
} from './types';

export type { Appraisal, Settings } from './types';

/** Spec §4.6: keep at most 500 appraisals, dropping the least recently updated. */
export const MAX_APPRAISALS = 500;

const KB = 1024;

/**
 * Per-entry ceiling. `chrome.storage.local` is capped at 10 MB unless the
 * extension asks for `unlimitedStorage`, which we deliberately do not request
 * (spec §5 keeps the permission list minimal). 500 × 64 KB is worst-case 32 MB,
 * so the cap is really there to stop one runaway appraisal — a pasted full text
 * in a note — from eating the whole quota and breaking every other save.
 */
export const MAX_APPRAISAL_BYTES = 64 * KB;

export const APPRAISAL_PREFIX = 'appraisal:';
export const SETTINGS_KEY = 'settings';

/** Bumped when the export file format changes in a way importAll cannot read. */
export const EXPORT_SCHEMA_VERSION = 1;

/** PubMed IDs are digits only. Also keeps `appraisal:<pmid>` free of path-like junk. */
const PMID_PATTERN = /^[0-9]{1,9}$/;

export interface ExportFile {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  appraisals: Appraisal[];
  settings: Settings;
}

export function appraisalKey(pmid: string): string {
  return `${APPRAISAL_PREFIX}${pmid}`;
}

export function isValidPmid(value: unknown): value is string {
  return typeof value === 'string' && PMID_PATTERN.test(value);
}

/* ------------------------------------------------------------------ guards */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMap(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return keys.every((key) => typeof value[key] === 'string');
}

function isValidityAnswers(value: unknown): value is ValidityAnswers {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (byItem) =>
      isRecord(byItem) &&
      Object.values(byItem).every((answer) => {
        if (!isRecord(answer)) return false;
        const verdict = answer['verdict'];
        const ok =
          verdict === null || verdict === 'yes' || verdict === 'no' || verdict === 'unclear';
        return ok && typeof answer['note'] === 'string';
      }),
  );
}

/**
 * Structural check for anything read back from storage or from an import file.
 * Anything that fails is treated as absent rather than crashing the panel.
 */
export function isAppraisal(value: unknown): value is Appraisal {
  if (!isRecord(value)) return false;
  if (value['schemaVersion'] !== 1) return false;
  if (!isValidPmid(value['pmid'])) return false;
  if (typeof value['createdAt'] !== 'number' || typeof value['updatedAt'] !== 'number')
    return false;
  if (!isRecord(value['citation'])) return false;
  if (!isStringMap(value['pico'], ['p', 'i', 'c', 'o'])) return false;
  if (!isValidityAnswers(value['validity'])) return false;
  if (typeof value['bottomLine'] !== 'string') return false;
  if (!Array.isArray(value['discussionQuestions'])) return false;
  return true;
}

/* ------------------------------------------------- explicit export allowlists */

function pickCitation(citation: CitationFields): CitationFields {
  return {
    title: citation.title,
    authors: [...citation.authors],
    journal: citation.journal,
    year: citation.year,
    doi: citation.doi,
  };
}

function pickValidity(validity: ValidityAnswers): ValidityAnswers {
  const out: ValidityAnswers = {};
  for (const [checklistId, answers] of Object.entries(validity)) {
    const byItem: Record<string, ItemAnswer> = {};
    for (const [itemId, answer] of Object.entries(answers)) {
      byItem[itemId] = { verdict: answer.verdict, note: answer.note };
    }
    out[checklistId] = byItem;
  }
  return out;
}

/**
 * Field-by-field copy, not a spread. An export file is a document the user can
 * hand to someone else, so every field in it has to be one we chose to publish;
 * a stray field on a stored object can never ride along.
 */
function pickAppraisal(a: Appraisal): Appraisal {
  return {
    schemaVersion: 1,
    pmid: a.pmid,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    citation: pickCitation(a.citation),
    designDetected: a.designDetected,
    designOverride: a.designOverride,
    pico: { p: a.pico.p, i: a.pico.i, c: a.pico.c, o: a.pico.o },
    numbers: a.numbers,
    validity: pickValidity(a.validity),
    bottomLine: a.bottomLine,
    discussionQuestions: [...a.discussionQuestions],
  };
}

/**
 * Allowlist, never a delete-list. v0.2 adds `apiKey` (and a license record) to
 * Settings; with a delete-list a field added later leaks into every export until
 * someone remembers to strip it, whereas here it stays out until this function
 * is deliberately changed.
 */
function pickSettings(s: Settings): Settings {
  return {
    schemaVersion: 1,
    counters: {
      panelOpens: s.counters.panelOpens,
      exports: s.counters.exports,
      aiRuns: s.counters.aiRuns,
    },
  };
}

/* --------------------------------------------------------------- appraisals */

export async function loadAppraisal(pmid: string): Promise<Appraisal | null> {
  if (!isValidPmid(pmid)) return null;
  const raw = await getStore().get<unknown>(appraisalKey(pmid));
  return isAppraisal(raw) ? raw : null;
}

export async function saveAppraisal(appraisal: Appraisal): Promise<void> {
  if (!isValidPmid(appraisal.pmid)) {
    throw new Error('This article has no usable PubMed ID, so it cannot be saved.');
  }
  const stamped: Appraisal = { ...appraisal, updatedAt: Date.now() };
  assertWithinSizeLimit(stamped);
  await getStore().set(appraisalKey(stamped.pmid), stamped);
  await evictOldest();
}

export async function deleteAppraisal(pmid: string): Promise<void> {
  if (!isValidPmid(pmid)) return;
  await getStore().remove(appraisalKey(pmid));
}

/** Newest first: the options page lists recent work at the top. */
export async function listAppraisals(): Promise<
  Pick<Appraisal, 'pmid' | 'updatedAt' | 'citation'>[]
> {
  const stored = await readStoredAppraisals();
  return stored
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ pmid, updatedAt, citation }) => ({ pmid, updatedAt, citation }));
}

function byteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

/** The thrown message is shown to the user verbatim (issue #1 B10). */
function assertWithinSizeLimit(appraisal: Appraisal): void {
  const bytes = byteLength(JSON.stringify(appraisal));
  if (bytes <= MAX_APPRAISAL_BYTES) return;
  throw new Error(
    `This appraisal is too large to save (${Math.ceil(bytes / KB)} KB; the limit is ` +
      `${MAX_APPRAISAL_BYTES / KB} KB per article). Shorten your notes and try again.`,
  );
}

async function readStoredAppraisals(): Promise<Appraisal[]> {
  const all = await getStore().getAll();
  const out: Appraisal[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(APPRAISAL_PREFIX)) continue;
    if (isAppraisal(value)) out.push(value);
  }
  return out;
}

/**
 * Spec §4.6: over the cap, the oldest go. Entries that no longer parse sort
 * first so a corrupt record is reclaimed before a usable one.
 */
async function evictOldest(): Promise<void> {
  const store = getStore();
  const all = await store.getAll();
  const entries: { key: string; updatedAt: number }[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(APPRAISAL_PREFIX)) continue;
    const updatedAt =
      isRecord(value) && typeof value['updatedAt'] === 'number' ? value['updatedAt'] : 0;
    entries.push({ key, updatedAt });
  }
  if (entries.length <= MAX_APPRAISALS) return;
  entries.sort((a, b) => a.updatedAt - b.updatedAt);
  const doomed = entries.slice(0, entries.length - MAX_APPRAISALS).map((entry) => entry.key);
  await store.remove(doomed);
}

/* ----------------------------------------------------------------- settings */

const COUNTER_NAMES: readonly CounterName[] = ['panelOpens', 'exports', 'aiRuns'];

export function defaultSettings(): Settings {
  return { schemaVersion: 1, counters: { panelOpens: 0, exports: 0, aiRuns: 0 } };
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Repairs a partial or foreign settings record instead of throwing: losing a
 * usage counter is never worth breaking the panel over.
 *
 * v0.2 note: when Settings gains `apiKey` / `license`, copy them here too, or
 * `incrementCounter` (load → save) will drop them on the next panel open.
 */
function normaliseSettings(raw: unknown): Settings {
  const settings = defaultSettings();
  if (!isRecord(raw)) return settings;
  const counters = raw['counters'];
  if (!isRecord(counters)) return settings;
  for (const name of COUNTER_NAMES) settings.counters[name] = toCount(counters[name]);
  return settings;
}

export async function loadSettings(): Promise<Settings> {
  return normaliseSettings(await getStore().get<unknown>(SETTINGS_KEY));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await getStore().set(SETTINGS_KEY, settings);
}

/* ------------------------------------------------------------ export/import */

export async function exportAll(): Promise<string> {
  const appraisals = (await readStoredAppraisals())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(pickAppraisal);
  const file: ExportFile = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appraisals,
    settings: pickSettings(await loadSettings()),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * `mode`:
 *   merge   — keep what is stored; an imported copy wins only when it is at
 *             least as new, so restoring an old backup cannot silently undo
 *             work done since. Usage counters take the higher of the two.
 *   replace — drop every stored appraisal and the settings record first, and
 *             take the file's counters verbatim.
 *
 * `skipped` counts entries that were not written: malformed, wrong PMID,
 * oversized, or older than the stored copy in merge mode.
 */
export async function importAll(
  json: string,
  mode: 'merge' | 'replace',
): Promise<{ imported: number; skipped: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON. Choose a file exported by this extension.');
  }
  if (!isRecord(parsed)) {
    throw new Error('That file is not a Journal Club Helper export.');
  }
  if (parsed['schemaVersion'] !== EXPORT_SCHEMA_VERSION) {
    throw new Error(
      'That export was written by a different version of this extension and cannot be read.',
    );
  }

  const store = getStore();
  if (mode === 'replace') {
    const all = await store.getAll();
    const ours = Object.keys(all).filter(
      (key) => key.startsWith(APPRAISAL_PREFIX) || key === SETTINGS_KEY,
    );
    // Only our own keys: another feature's data is not this import's business.
    if (ours.length > 0) await store.remove(ours);
  }

  const incoming = Array.isArray(parsed['appraisals']) ? parsed['appraisals'] : [];
  let imported = 0;
  let skipped = 0;
  for (const raw of incoming) {
    if (!isAppraisal(raw)) {
      skipped += 1;
      continue;
    }
    const appraisal = pickAppraisal(raw);
    if (byteLength(JSON.stringify(appraisal)) > MAX_APPRAISAL_BYTES) {
      skipped += 1;
      continue;
    }
    if (mode === 'merge') {
      const existing = await loadAppraisal(appraisal.pmid);
      if (existing && existing.updatedAt > appraisal.updatedAt) {
        skipped += 1;
        continue;
      }
    }
    // The key comes from the validated PMID, never from a key in the file, so
    // only `appraisal:*` and `settings` can ever be written here.
    await store.set(appraisalKey(appraisal.pmid), appraisal);
    imported += 1;
  }

  const settings = parsed['settings'];
  if (isRecord(settings)) {
    const incomingSettings = normaliseSettings(settings);
    if (mode === 'merge') {
      // Counters only ever go up, so merging a backup from another device must
      // not hand back a lower number than this device has already reached.
      const current = await loadSettings();
      for (const name of COUNTER_NAMES) {
        incomingSettings.counters[name] = Math.max(
          current.counters[name],
          incomingSettings.counters[name],
        );
      }
    }
    await saveSettings(incomingSettings);
  }

  await evictOldest();
  return { imported, skipped };
}
