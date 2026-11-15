import { beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/lib/kv-store';
import { createMemoryStore, setStore } from '../../src/lib/kv-store';
import { incrementCounter } from '../../src/lib/counters';
import { loadSettings, saveSettings } from '../../src/lib/storage';

let store: KeyValueStore;

beforeEach(() => {
  store = createMemoryStore();
  setStore(store);
});

describe('incrementCounter', () => {
  it('starts from the zeroed defaults', async () => {
    await incrementCounter('panelOpens');
    expect((await loadSettings()).counters).toEqual({ panelOpens: 1, exports: 0, aiRuns: 0 });
  });

  it('counts each name independently', async () => {
    await incrementCounter('panelOpens');
    await incrementCounter('exports');
    await incrementCounter('exports');
    await incrementCounter('aiRuns');
    expect((await loadSettings()).counters).toEqual({ panelOpens: 1, exports: 2, aiRuns: 1 });
  });

  it('keeps ten concurrent increments from losing writes', async () => {
    await Promise.all(Array.from({ length: 10 }, () => incrementCounter('panelOpens')));
    expect((await loadSettings()).counters.panelOpens).toBe(10);
  });

  it('serialises concurrent increments of different counters', async () => {
    await Promise.all([
      ...Array.from({ length: 10 }, () => incrementCounter('exports')),
      ...Array.from({ length: 5 }, () => incrementCounter('aiRuns')),
    ]);
    const { counters } = await loadSettings();
    expect(counters.exports).toBe(10);
    expect(counters.aiRuns).toBe(5);
  });

  it('preserves counters that were already stored', async () => {
    await saveSettings({
      schemaVersion: 1,
      counters: { panelOpens: 41, exports: 3, aiRuns: 0 },
      locale: 'auto',
    });
    await incrementCounter('panelOpens');
    expect((await loadSettings()).counters).toEqual({ panelOpens: 42, exports: 3, aiRuns: 0 });
  });

  it('does not touch any key other than settings', async () => {
    await incrementCounter('exports');
    expect(Object.keys(await store.getAll())).toEqual(['settings']);
  });

  it('keeps the queue alive after a failed write', async () => {
    let failNext = true;
    const flaky: KeyValueStore = {
      get: <T>(key: string) => store.get<T>(key),
      getAll: () => store.getAll(),
      remove: (keys: string | string[]) => store.remove(keys),
      set: (key: string, value: unknown) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error('quota exceeded'));
        }
        return store.set(key, value);
      },
    };
    setStore(flaky);

    await expect(incrementCounter('exports')).rejects.toThrow(/quota/);
    await incrementCounter('exports');
    expect((await loadSettings()).counters.exports).toBe(1);
  });

  // #82: the counters and the language share one record.
  it('keeps the language preference when it counts', async () => {
    await saveSettings({
      schemaVersion: 1,
      counters: { panelOpens: 1, exports: 0, aiRuns: 0 },
      locale: 'ja',
    });
    await incrementCounter('exports');
    expect((await loadSettings()).locale).toBe('ja');
  });
});
