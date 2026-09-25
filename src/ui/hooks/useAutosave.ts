/**
 * Autosave and restore for the side panel (issue #18).
 *
 * Spec §3-5: typing in a tab is saved per PMID and reopening the same article
 * brings everything back. Writes are debounced so a burst of keystrokes costs
 * one `chrome.storage.local` write, and any pending write is flushed when the
 * panel unmounts — closing the panel must not lose the last edit.
 */
import { useEffect, useRef } from 'preact/hooks';
import { loadAppraisal, saveAppraisal } from '../../lib/storage';
import type { Appraisal, PubMedArticle } from '../../lib/types';
import { actions, toAppraisal, useStore } from '../store';

export const AUTOSAVE_DEBOUNCE_MS = 500;

export interface AutosaveOptions {
  /** Defaults to `saveAppraisal`; the tests inject a recorder. */
  save?: (appraisal: Appraisal) => Promise<void>;
  onError?: (message: string) => void;
  onSaved?: () => void;
  delayMs?: number;
}

export interface AutosaveController {
  /** Queue a debounced write. A snapshot equal to the last one is ignored. */
  schedule(appraisal: Appraisal): void;
  /** Adopt a snapshot as the baseline without writing it, flushing anything pending first. */
  prime(appraisal: Appraisal): Promise<void>;
  /** Write the pending snapshot now and wait for it. */
  flush(): Promise<void>;
  cancel(): void;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Could not save this appraisal. Your most recent edit may be lost.';
}

/**
 * Identity of the *content*. `toAppraisal` stamps a fresh `updatedAt` on every
 * call, so comparing raw JSON would make every unrelated re-render look like an
 * edit — including the re-render caused by reporting a save error, which would
 * then retry the same failing write forever.
 */
function contentKey(appraisal: Appraisal): string {
  return JSON.stringify({ ...appraisal, updatedAt: 0 });
}

export function createAutosaveController(options: AutosaveOptions = {}): AutosaveController {
  const save = options.save ?? saveAppraisal;
  const onError = options.onError ?? ((message: string) => actions.setSaveError(message));
  const onSaved = options.onSaved ?? (() => actions.setSaveError(null));
  const delayMs = options.delayMs ?? AUTOSAVE_DEBOUNCE_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Appraisal | null = null;
  let lastWritten: string | null = null;
  // Writes are serialised so a slow one cannot land after a newer one.
  let inFlight: Promise<void> = Promise.resolve();

  async function write(appraisal: Appraisal): Promise<void> {
    try {
      await save(appraisal);
      onSaved();
    } catch (error) {
      // The baseline stays put: the user fixes the problem (a note over the size
      // cap, say) and the next real edit retries. Retrying the identical
      // snapshot would just loop.
      onError(messageOf(error));
    }
  }

  function stopTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function run(): void {
    stopTimer();
    const appraisal = pending;
    pending = null;
    if (!appraisal) return;
    inFlight = inFlight.then(() => write(appraisal));
  }

  function schedule(appraisal: Appraisal): void {
    const key = contentKey(appraisal);
    if (key === lastWritten) return;
    lastWritten = key;
    pending = appraisal;
    stopTimer();
    timer = setTimeout(run, delayMs);
  }

  async function flush(): Promise<void> {
    run();
    await inFlight;
  }

  async function prime(appraisal: Appraisal): Promise<void> {
    // Anything still pending belongs to the article we are leaving.
    await flush();
    lastWritten = contentKey(appraisal);
  }

  function cancel(): void {
    stopTimer();
    pending = null;
  }

  return { schedule, prime, flush, cancel };
}

/**
 * Remembers which appraisal the panel is editing so autosave keeps the original
 * `createdAt` instead of resetting it on every write.
 */
let lastRestore: { pmid: string; createdAt: number } | null = null;

/** Restore on PMID bind: load the saved appraisal and push it into the store. */
export async function restoreAppraisal(pmid: string): Promise<Appraisal | null> {
  let saved: Appraisal | null = null;
  try {
    saved = await loadAppraisal(pmid);
  } catch (error) {
    // A failed read must still release the panel: the user gets an empty form.
    actions.setSaveError(messageOf(error));
  }
  lastRestore = { pmid, createdAt: saved?.createdAt ?? Date.now() };
  actions.hydrateFrom(saved);
  return saved;
}

function createdAtFor(pmid: string): number {
  return lastRestore?.pmid === pmid ? lastRestore.createdAt : Date.now();
}

/**
 * Mount once, near the root of the panel:
 *
 *   export function App() {
 *     useAutosave();
 *     ...
 *   }
 *
 * It restores the stored appraisal as soon as an article is bound, then saves
 * every later change, and flushes on unmount.
 */
export function useAutosave(options: AutosaveOptions = {}): void {
  const state = useStore((s) => s);

  const controllerRef = useRef<AutosaveController | null>(null);
  controllerRef.current ??= createAutosaveController(options);
  const controller = controllerRef.current;

  // Both refs hold the bound article by reference, which `store.resetForArticle`
  // replaces on every bind. That is what marks a PMID switch.
  const restoringFor = useRef<PubMedArticle | null>(null);
  const primedFor = useRef<PubMedArticle | null>(null);

  useEffect(() => {
    // Closing the side panel tears its document down without unmounting the
    // component, so the cleanup below never runs there and an edit still inside
    // the debounce was lost. Measured in Chromium: `beforeunload` and
    // `visibilitychange` fire early enough for a storage write started in them
    // to land; one started in `pagehide` does not. Flushing twice is harmless.
    const flushNow = (): void => {
      void controller.flush();
    };
    const flushIfHidden = (): void => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('beforeunload', flushNow);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.removeEventListener('beforeunload', flushNow);
      document.removeEventListener('visibilitychange', flushIfHidden);
      void controller.flush();
    };
  }, [controller]);

  useEffect(() => {
    const article = state.article;
    if (!article) return;

    if (!state.hydrated) {
      if (restoringFor.current === article) return;
      restoringFor.current = article;
      void restoreAppraisal(article.pmid);
      return;
    }

    const appraisal = toAppraisal(state, createdAtFor(article.pmid));
    if (!appraisal) return;

    if (primedFor.current !== article) {
      primedFor.current = article;
      // Freshly restored state is not an edit: priming stops the panel from
      // writing an empty appraisal just because someone opened an article.
      void controller.prime(appraisal);
      return;
    }

    controller.schedule(appraisal);
  }, [state, controller]);
}
