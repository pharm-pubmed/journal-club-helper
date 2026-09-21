import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStore } from '../../src/lib/kv-store';
import { createMemoryStore, getStore, setStore } from '../../src/lib/kv-store';
import {
  MAX_APPRAISALS,
  MAX_APPRAISAL_BYTES,
  appraisalKey,
  deleteAppraisal,
  exportAll,
  importAll,
  listAppraisals,
  loadAppraisal,
  loadSettings,
  saveAppraisal,
  saveSettings,
} from '../../src/lib/storage';
import type { Appraisal, Settings } from '../../src/lib/storage';
import { createAutosaveController } from '../../src/ui/hooks/useAutosave';

let store: KeyValueStore;

function makeAppraisal(pmid: string, overrides: Partial<Appraisal> = {}): Appraisal {
  return {
    schemaVersion: 1,
    pmid,
    createdAt: 1_000,
    updatedAt: 1_000,
    citation: {
      title: `Trial ${pmid}`,
      authors: ['Doe J', 'Roe A'],
      journal: 'NEJM',
      year: '2024',
      doi: '10.1000/xyz',
    },
    designDetected: null,
    designOverride: 'rct',
    pico: { p: 'adults', i: 'drug', c: 'placebo', o: 'death' },
    numbers: null,
    validity: { rct: { r1: { verdict: 'yes', note: 'concealed' } } },
    bottomLine: 'Looks solid.',
    discussionQuestions: [],
    ...overrides,
  };
}

beforeEach(() => {
  store = createMemoryStore();
  setStore(store);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('kv-store', () => {
  it('round trips values and lists them', async () => {
    await store.set('a', { n: 1 });
    await store.set('b', 'two');
    expect(await store.get<{ n: number }>('a')).toEqual({ n: 1 });
    expect(await store.getAll()).toEqual({ a: { n: 1 }, b: 'two' });
  });

  it('returns undefined for a missing key and removes keys', async () => {
    expect(await store.get('nope')).toBeUndefined();
    await store.set('a', 1);
    await store.set('b', 2);
    await store.remove(['a', 'b']);
    expect(await store.getAll()).toEqual({});
  });

  it('stores a structural copy, so later mutation of the caller object cannot leak in', async () => {
    const value = { list: [1] };
    await store.set('a', value);
    value.list.push(2);
    expect(await store.get<{ list: number[] }>('a')).toEqual({ list: [1] });
  });

  it('setStore swaps the active implementation', async () => {
    const other = createMemoryStore();
    setStore(other);
    expect(getStore()).toBe(other);
  });
});

describe('appraisalKey', () => {
  it('namespaces the PMID', () => {
    expect(appraisalKey('12345678')).toBe('appraisal:12345678');
  });
});

describe('saveAppraisal / loadAppraisal', () => {
  it('round trips an appraisal', async () => {
    const a = makeAppraisal('11111111');
    await saveAppraisal(a);
    const loaded = await loadAppraisal('11111111');
    expect(loaded).not.toBeNull();
    expect(loaded?.pico).toEqual(a.pico);
    expect(loaded?.validity).toEqual(a.validity);
    expect(loaded?.citation).toEqual(a.citation);
    expect(loaded?.createdAt).toBe(1_000);
  });

  it('stamps updatedAt on every save', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await saveAppraisal(makeAppraisal('11111111'));
    const first = await loadAppraisal('11111111');
    expect(first?.updatedAt).toBe(Date.now());

    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    await saveAppraisal(makeAppraisal('11111111'));
    const second = await loadAppraisal('11111111');
    expect(second?.updatedAt).toBe(Date.now());
    expect(second?.updatedAt).toBeGreaterThan(first?.updatedAt ?? 0);
  });

  it('returns null for an unknown PMID', async () => {
    expect(await loadAppraisal('99999999')).toBeNull();
  });

  it('returns null when the stored value is not a valid appraisal', async () => {
    await store.set(appraisalKey('11111111'), { schemaVersion: 2, pmid: '11111111' });
    expect(await loadAppraisal('11111111')).toBeNull();
  });

  it('rejects an unusable PMID instead of writing a junk key', async () => {
    await expect(saveAppraisal(makeAppraisal('not-a-pmid'))).rejects.toThrow();
    expect(Object.keys(await store.getAll())).toHaveLength(0);
  });
});

describe('deleteAppraisal / listAppraisals', () => {
  it('deletes one entry and leaves the others', async () => {
    await saveAppraisal(makeAppraisal('11111111'));
    await saveAppraisal(makeAppraisal('22222222'));
    await deleteAppraisal('11111111');
    expect(await loadAppraisal('11111111')).toBeNull();
    expect(await loadAppraisal('22222222')).not.toBeNull();
  });

  it('lists a summary of each appraisal, newest first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await saveAppraisal(makeAppraisal('11111111'));
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    await saveAppraisal(makeAppraisal('22222222'));

    const list = await listAppraisals();
    expect(list.map((e) => e.pmid)).toEqual(['22222222', '11111111']);
    expect(list[0]?.citation.title).toBe('Trial 22222222');
    // Summary only: the heavy fields stay out of the list view.
    expect(list[0]).not.toHaveProperty('validity');
  });
});

describe('eviction', () => {
  it(`evicts the oldest entry once the count passes ${MAX_APPRAISALS}`, async () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_APPRAISALS; i += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
      await saveAppraisal(makeAppraisal(String(10_000_000 + i)));
    }
    expect(await listAppraisals()).toHaveLength(MAX_APPRAISALS);
    expect(await loadAppraisal('10000000')).not.toBeNull();

    // The 501st save must push out the entry with the oldest updatedAt.
    vi.setSystemTime(new Date(2026, 0, 2));
    await saveAppraisal(makeAppraisal('20000000'));

    const list = await listAppraisals();
    expect(list).toHaveLength(MAX_APPRAISALS);
    expect(await loadAppraisal('10000000')).toBeNull();
    expect(await loadAppraisal('10000001')).not.toBeNull();
    expect(await loadAppraisal('20000000')).not.toBeNull();
  });

  it('never evicts non-appraisal keys', async () => {
    vi.useFakeTimers();
    await saveSettings({ schemaVersion: 1, counters: { panelOpens: 3, exports: 1, aiRuns: 0 } });
    for (let i = 0; i <= MAX_APPRAISALS; i += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
      await saveAppraisal(makeAppraisal(String(10_000_000 + i)));
    }
    const settings = await loadSettings();
    expect(settings.counters.panelOpens).toBe(3);
  });
});

describe('size guard', () => {
  it('rejects an appraisal above the per-entry cap with a user-readable message', async () => {
    const huge = makeAppraisal('11111111', { bottomLine: 'x'.repeat(MAX_APPRAISAL_BYTES) });
    await expect(saveAppraisal(huge)).rejects.toThrow(/too large/i);
    await expect(saveAppraisal(huge)).rejects.toThrow(/64 KB/);
    expect(await loadAppraisal('11111111')).toBeNull();
  });

  it('accepts an appraisal just under the cap', async () => {
    const big = makeAppraisal('11111111', { bottomLine: 'x'.repeat(MAX_APPRAISAL_BYTES - 1_000) });
    await expect(saveAppraisal(big)).resolves.toBeUndefined();
    expect(await loadAppraisal('11111111')).not.toBeNull();
  });
});

describe('settings', () => {
  it('returns zeroed defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual({
      schemaVersion: 1,
      counters: { panelOpens: 0, exports: 0, aiRuns: 0 },
    });
  });

  it('round trips settings', async () => {
    await saveSettings({ schemaVersion: 1, counters: { panelOpens: 2, exports: 5, aiRuns: 1 } });
    expect((await loadSettings()).counters).toEqual({ panelOpens: 2, exports: 5, aiRuns: 1 });
  });

  it('repairs a partially written settings object', async () => {
    await store.set('settings', { schemaVersion: 1, counters: { exports: 4 } });
    expect((await loadSettings()).counters).toEqual({ panelOpens: 0, exports: 4, aiRuns: 0 });
  });
});

describe('exportAll', () => {
  it('produces exportedAt, appraisals and settings', async () => {
    await saveAppraisal(makeAppraisal('11111111'));
    await saveSettings({ schemaVersion: 1, counters: { panelOpens: 7, exports: 2, aiRuns: 0 } });

    const parsed = JSON.parse(await exportAll());
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.appraisals).toHaveLength(1);
    expect(parsed.appraisals[0].pmid).toBe('11111111');
    expect(parsed.appraisals[0].pico).toEqual({ p: 'adults', i: 'drug', c: 'placebo', o: 'death' });
    expect(parsed.settings.counters).toEqual({ panelOpens: 7, exports: 2, aiRuns: 0 });
  });

  it('excludes secrets that a future Settings version may hold', async () => {
    // v0.2 adds `apiKey` / `license` to Settings; the export is an allowlist, so
    // a field nobody remembered to strip can never reach the file.
    await store.set('settings', {
      schemaVersion: 1,
      counters: { panelOpens: 1, exports: 0, aiRuns: 0 },
      apiKey: 'sk-ant-SUPER-SECRET',
      license: { key: 'LIC-SECRET' },
    });
    const json = await exportAll();
    expect(json).not.toContain('sk-ant-SUPER-SECRET');
    expect(json).not.toContain('LIC-SECRET');
    expect(json).not.toContain('apiKey');
    expect(JSON.parse(json).settings).toEqual({
      schemaVersion: 1,
      counters: { panelOpens: 1, exports: 0, aiRuns: 0 },
    });
  });
});

describe('importAll', () => {
  async function exportOf(appraisals: Appraisal[], settings?: Settings): Promise<string> {
    const fresh = createMemoryStore();
    setStore(fresh);
    for (const a of appraisals) await saveAppraisal(a);
    if (settings) await saveSettings(settings);
    const json = await exportAll();
    setStore(store);
    return json;
  }

  it('merges: existing entries survive and the file adds its own', async () => {
    const json = await exportOf([makeAppraisal('22222222')]);
    await saveAppraisal(makeAppraisal('11111111'));

    const result = await importAll(json, 'merge');
    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(await loadAppraisal('11111111')).not.toBeNull();
    expect(await loadAppraisal('22222222')).not.toBeNull();
  });

  it('replaces: everything stored beforehand is dropped', async () => {
    const json = await exportOf([makeAppraisal('22222222')]);
    await saveAppraisal(makeAppraisal('11111111'));

    const result = await importAll(json, 'replace');
    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(await loadAppraisal('11111111')).toBeNull();
    expect(await loadAppraisal('22222222')).not.toBeNull();
  });

  it('merges without overwriting a newer local edit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const json = await exportOf([makeAppraisal('11111111', { bottomLine: 'from the file' })]);

    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    await saveAppraisal(makeAppraisal('11111111', { bottomLine: 'edited here' }));

    const result = await importAll(json, 'merge');
    expect(result).toEqual({ imported: 0, skipped: 1 });
    expect((await loadAppraisal('11111111'))?.bottomLine).toBe('edited here');
  });

  it('restores settings from the file', async () => {
    const json = await exportOf([], {
      schemaVersion: 1,
      counters: { panelOpens: 9, exports: 4, aiRuns: 0 },
    });
    await importAll(json, 'replace');
    expect((await loadSettings()).counters).toEqual({ panelOpens: 9, exports: 4, aiRuns: 0 });
  });

  // A backup restored onto a device that has kept working must not hand back a
  // counter that is lower than the number this device already reached.
  it('merges usage counters by keeping the higher of the two', async () => {
    const json = await exportOf([], {
      schemaVersion: 1,
      counters: { panelOpens: 9, exports: 1, aiRuns: 0 },
    });
    await saveSettings({
      schemaVersion: 1,
      counters: { panelOpens: 2, exports: 7, aiRuns: 0 },
    });

    await importAll(json, 'merge');
    expect((await loadSettings()).counters).toEqual({ panelOpens: 9, exports: 7, aiRuns: 0 });
  });

  it('takes the file counters verbatim in replace mode', async () => {
    const json = await exportOf([], {
      schemaVersion: 1,
      counters: { panelOpens: 1, exports: 1, aiRuns: 0 },
    });
    await saveSettings({
      schemaVersion: 1,
      counters: { panelOpens: 50, exports: 50, aiRuns: 0 },
    });

    await importAll(json, 'replace');
    expect((await loadSettings()).counters).toEqual({ panelOpens: 1, exports: 1, aiRuns: 0 });
  });

  it('rejects corrupt JSON', async () => {
    await expect(importAll('{ not json', 'merge')).rejects.toThrow(/valid JSON/i);
    await expect(importAll('[]', 'merge')).rejects.toThrow();
    await expect(importAll('null', 'merge')).rejects.toThrow();
  });

  it('rejects an unknown schemaVersion', async () => {
    const json = JSON.stringify({ schemaVersion: 99, exportedAt: 'x', appraisals: [] });
    await expect(importAll(json, 'merge')).rejects.toThrow(/version/i);
  });

  it('skips entries with a bad PMID or a bad schema', async () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appraisals: [
        makeAppraisal('11111111'),
        makeAppraisal('../../evil'),
        makeAppraisal('', { pmid: '' }),
        { schemaVersion: 2, pmid: '33333333' },
        'not an object',
      ],
    });
    const result = await importAll(json, 'merge');
    expect(result).toEqual({ imported: 1, skipped: 4 });
    expect(Object.keys(await store.getAll())).toEqual(['appraisal:11111111']);
  });

  it('never writes a key other than appraisal:* and settings', async () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appraisals: [makeAppraisal('11111111')],
      settings: { schemaVersion: 1, counters: { panelOpens: 1, exports: 0, aiRuns: 0 } },
      'appraisal:99999999': { hijacked: true },
      apiKey: 'sk-ant-INJECTED',
      __proto__banana: { evil: true },
      license: 'LIC',
    });
    await importAll(json, 'replace');
    expect(Object.keys(await store.getAll()).sort()).toEqual(['appraisal:11111111', 'settings']);
    expect(JSON.stringify(await store.getAll())).not.toContain('INJECTED');
  });

  it('skips an oversized entry instead of failing the whole import', async () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appraisals: [
        makeAppraisal('11111111'),
        makeAppraisal('22222222', { bottomLine: 'x'.repeat(MAX_APPRAISAL_BYTES) }),
      ],
    });
    expect(await importAll(json, 'merge')).toEqual({ imported: 1, skipped: 1 });
  });
});

describe('autosave controller', () => {
  it('coalesces a burst of edits into one write', async () => {
    vi.useFakeTimers();
    const writes: Appraisal[] = [];
    const controller = createAutosaveController({
      save: async (a) => {
        writes.push(a);
      },
    });

    controller.schedule(makeAppraisal('11111111', { bottomLine: 'a' }));
    controller.schedule(makeAppraisal('11111111', { bottomLine: 'ab' }));
    controller.schedule(makeAppraisal('11111111', { bottomLine: 'abc' }));

    await vi.advanceTimersByTimeAsync(499);
    expect(writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.bottomLine).toBe('abc');
  });

  it('ignores a schedule whose content is unchanged', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const controller = createAutosaveController({
      save: async () => {
        calls += 1;
      },
    });

    controller.schedule(makeAppraisal('11111111', { bottomLine: 'a' }));
    await vi.advanceTimersByTimeAsync(500);
    controller.schedule(makeAppraisal('11111111', { bottomLine: 'a', updatedAt: 123 }));
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);
  });

  it('flush writes the pending edit immediately (panel close must not lose it)', async () => {
    vi.useFakeTimers();
    const writes: Appraisal[] = [];
    const controller = createAutosaveController({
      save: async (a) => {
        writes.push(a);
      },
    });

    controller.schedule(makeAppraisal('11111111', { bottomLine: 'last words' }));
    await controller.flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.bottomLine).toBe('last words');

    // Nothing left pending, so the timer firing afterwards writes nothing more.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toHaveLength(1);
  });

  it('reports a rejected write through onError without looping on the same snapshot', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    let attempts = 0;
    const controller = createAutosaveController({
      save: async () => {
        attempts += 1;
        throw new Error('This appraisal is too large to save.');
      },
      onError: (message) => errors.push(message),
    });

    controller.schedule(makeAppraisal('11111111', { bottomLine: 'a' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(errors).toEqual(['This appraisal is too large to save.']);
    expect(attempts).toBe(1);

    // Re-rendering after the error must not retry the identical snapshot.
    controller.schedule(makeAppraisal('11111111', { bottomLine: 'a' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(attempts).toBe(1);

    // The next real edit does try again.
    controller.schedule(makeAppraisal('11111111', { bottomLine: 'ab' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(attempts).toBe(2);
    expect(errors).toHaveLength(2);
  });

  it('writes through to storage by default', async () => {
    vi.useFakeTimers();
    const controller = createAutosaveController();
    controller.schedule(makeAppraisal('11111111'));
    await controller.flush();
    expect(await loadAppraisal('11111111')).not.toBeNull();
  });

  it('prime records the baseline without writing, and flushes a pending write first', async () => {
    vi.useFakeTimers();
    const writes: Appraisal[] = [];
    const controller = createAutosaveController({
      save: async (a) => {
        writes.push(a);
      },
    });

    controller.schedule(makeAppraisal('11111111', { bottomLine: 'unsaved edit' }));
    await controller.prime(makeAppraisal('22222222'));
    expect(writes.map((w) => w.pmid)).toEqual(['11111111']);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toHaveLength(1);
  });
});
