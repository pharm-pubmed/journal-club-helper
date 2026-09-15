/**
 * The persistence seam (issue #18).
 *
 * `storage.ts` and `counters.ts` never name `chrome` themselves: they go through
 * `KeyValueStore`, so the unit tests swap in `createMemoryStore()` and the repo
 * needs no chrome mocking library.
 *
 * `chrome.storage.sync` is forbidden repo-wide (SPEC.ja.md §4.6, enforced by
 * ESLint): v0.2 keeps the user's API key in Settings and it must never leave
 * this device.
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

/**
 * `chrome.storage.local` accepts only JSON-serialisable values and hands back a
 * fresh object each read. Cloning keeps the in-memory store honest about both,
 * so a test cannot pass by mutating an object the store still holds.
 */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function asList(keys: string | string[]): string[] {
  return Array.isArray(keys) ? keys : [keys];
}

/** Volatile store used by the unit tests and as the fallback when `chrome` is absent. */
export function createMemoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, unknown>(Object.entries(clone(initial)));
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const value = data.get(key);
      return value === undefined ? undefined : (clone(value) as T);
    },
    async set(key: string, value: unknown): Promise<void> {
      data.set(key, clone(value));
    },
    async remove(keys: string | string[]): Promise<void> {
      for (const key of asList(keys)) data.delete(key);
    },
    async getAll(): Promise<Record<string, unknown>> {
      return clone(Object.fromEntries(data));
    },
  };
}

/**
 * `chrome` is undefined in the unit tests (plain node) and in any non-extension
 * context. Falling back to a process-local store keeps every call resolving
 * instead of throwing at import time; inside the extension it is never used.
 */
let fallback: KeyValueStore | null = null;

function localArea(): typeof chrome.storage.local | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.storage?.local ?? null;
}

function fallbackStore(): KeyValueStore {
  fallback ??= createMemoryStore();
  return fallback;
}

export const chromeLocalStore: KeyValueStore = {
  async get<T>(key: string): Promise<T | undefined> {
    const area = localArea();
    if (!area) return fallbackStore().get<T>(key);
    const bag = await area.get(key);
    return bag[key] as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    const area = localArea();
    if (!area) return fallbackStore().set(key, value);
    await area.set({ [key]: value });
  },
  async remove(keys: string | string[]): Promise<void> {
    const area = localArea();
    if (!area) return fallbackStore().remove(keys);
    await area.remove(keys);
  },
  async getAll(): Promise<Record<string, unknown>> {
    const area = localArea();
    if (!area) return fallbackStore().getAll();
    return (await area.get(null)) as Record<string, unknown>;
  },
};

let activeStore: KeyValueStore = chromeLocalStore;

/** Swap the backing store. The tests call this; production never does. */
export function setStore(store: KeyValueStore): void {
  activeStore = store;
}

export function getStore(): KeyValueStore {
  return activeStore;
}

/** Restore the extension's real store, for a test that swapped it out. */
export function resetStore(): void {
  activeStore = chromeLocalStore;
}
