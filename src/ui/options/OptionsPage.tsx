/**
 * Options page (issue #21).
 *
 * Scope fixed by the spec: §4.6 (JSON export / import belongs in settings),
 * §7 (the local usage counters are shown back to the user) and §1 (the
 * educational positioning has to hold in the UI copy, not only in the store
 * listing).
 *
 * Two rules this file keeps:
 *
 * 1. No network, of any kind. No fetch, no external font, no CDN image, no
 *    analytics. The privacy claim in the Usage section is only true while that
 *    holds, and a user can check it in the Network tab in seconds.
 * 2. Every `chrome.*` access is guarded, so the module still imports and the
 *    page still renders outside the extension (a plain Vite preview, a future
 *    component test).
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  MAX_APPRAISALS,
  deleteAppraisal,
  exportAll,
  importAll,
  listAppraisals,
  loadSettings,
} from '../../lib/storage';
import type { Appraisal, Settings } from '../../lib/storage';
import { PRODUCT_NAME } from '../labels';
import './options.css';

/** TODO(#28): replace with the published privacy policy URL before the store submission. */
const PRIVACY_URL = 'https://github.com/piroshi1989/journal-club-helper/blob/main/docs/PRIVACY.md';
const ISSUES_URL = 'https://github.com/piroshi1989/journal-club-helper/issues';

type AppraisalSummary = Pick<Appraisal, 'pmid' | 'updatedAt' | 'citation'>;
type ImportMode = 'merge' | 'replace';
type Message = { tone: 'ok' | 'error'; text: string };

/** How many of the most recent appraisals the list shows before collapsing to a count. */
const RECENT_SHOWN = 5;

/* ------------------------------------------------------------------ helpers */

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function formatDate(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return 'an unknown date';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** `journal-club-helper-backup-2026-09-15.json`, in the user's own local date. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `journal-club-helper-backup-${stamp}.json`;
}

/**
 * Blob + a temporary `<a download>`. A download is the only way out of the
 * extension for this data; nothing is uploaded anywhere.
 */
function downloadJson(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download before Chrome reads it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function extensionVersion(): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest) return null;
  return chrome.runtime.getManifest().version;
}

function importSummary(imported: number, skipped: number, mode: ImportMode): string {
  const head =
    mode === 'replace'
      ? `Replaced everything stored here with ${plural(imported, 'appraisal', 'appraisals')} from the file.`
      : `Imported ${plural(imported, 'appraisal', 'appraisals')}.`;
  if (skipped === 0) return head;
  const why =
    mode === 'replace'
      ? 'they could not be read'
      : 'the copy already saved here is newer, or they could not be read';
  return `${head} Skipped ${skipped.toLocaleString()} (${why}).`;
}

/* --------------------------------------------------------------------- page */

export function OptionsPage() {
  const [appraisals, setAppraisals] = useState<AppraisalSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, loaded] = await Promise.all([listAppraisals(), loadSettings()]);
      setAppraisals(list);
      setSettings(loaded);
      setLoadError(null);
    } catch (error) {
      setAppraisals([]);
      setLoadError(messageOf(error, 'Could not read your saved data from this browser.'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const json = await exportAll();
      downloadJson(json, backupFilename());
      setMessage({
        tone: 'ok',
        text: `Saved ${plural(appraisals?.length ?? 0, 'appraisal', 'appraisals')} to your downloads folder.`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: messageOf(error, 'Could not build the backup file.') });
    } finally {
      setBusy(false);
    }
  }

  /**
   * The picker is a hidden `<input type="file">` driven by the button, so the
   * merge / replace choice is made before a file is ever read. Reading is the
   * File API only — the file never leaves the page.
   */
  async function handleFileChosen(): Promise<void> {
    const input = fileRef.current;
    const file = input?.files?.[0] ?? null;
    // Clearing lets the same file be chosen twice in a row and still fire change.
    if (input) input.value = '';
    if (!file) return;

    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      // importAll throws a sentence meant for the user on a malformed file;
      // it is shown as-is rather than being swallowed or rethrown.
      const { imported, skipped, settingsOnly } = await importAll(text, importMode);
      await refresh();
      setMessage({
        tone: 'ok',
        text: settingsOnly
          ? 'Restored usage counts. Existing appraisals were kept.'
          : importSummary(imported, skipped, importMode),
      });
    } catch (error) {
      // Storage failures can leave a partially applied import. Show the actual
      // saved list and counters alongside the progress reported by the error.
      await refresh();
      setMessage({
        tone: 'error',
        text: messageOf(
          error,
          'Could not read that file. Choose a backup exported by this extension.',
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  /**
   * There is no bulk delete in storage.ts on purpose (one key per PMID), so the
   * page walks the list. Settings are left alone: the usage counts are not part
   * of "your data" in the sense the button promises.
   */
  async function handleDeleteAll(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const list = await listAppraisals();
      for (const item of list) await deleteAppraisal(item.pmid);
      await refresh();
      setConfirmingDelete(false);
      setMessage({
        tone: 'ok',
        text: `Deleted ${plural(list.length, 'appraisal', 'appraisals')}. The usage counts below were kept.`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: messageOf(error, 'Could not delete your appraisals.') });
    } finally {
      setBusy(false);
    }
  }

  const loading = appraisals === null;
  const count = appraisals?.length ?? 0;
  const recent = (appraisals ?? []).slice(0, RECENT_SHOWN);
  const nearCap = count >= MAX_APPRAISALS - 50;

  return (
    <div class="options">
      <header class="options__masthead">
        <h1 class="options__title">{PRODUCT_NAME}</h1>
        <p class="options__tagline">
          Settings and saved data. Everything on this page is stored in this browser, on this
          device.
        </p>
      </header>

      {/* --------------------------------------------------------- your data */}
      <section class="options__section" aria-labelledby="data-heading">
        <h2 class="options__heading" id="data-heading">
          Your data
        </h2>

        {loadError ? (
          <p class="options__message options__message--error">{loadError}</p>
        ) : loading ? (
          <p class="options__note">Reading your saved appraisals…</p>
        ) : (
          <>
            <p class="options__count">
              <strong class="options__count-value">{count.toLocaleString()}</strong>
              <span class="options__count-label">
                {count === 1 ? 'appraisal saved' : 'appraisals saved'} of{' '}
                {MAX_APPRAISALS.toLocaleString()}
              </span>
            </p>
            {count === 0 ? (
              <p class="options__note">
                Nothing saved yet. Open a PubMed abstract and start an appraisal in the side panel —
                it is saved here automatically.
              </p>
            ) : null}
            {nearCap ? (
              <p class="options__note options__note--warning">
                You are close to the limit. Past {MAX_APPRAISALS.toLocaleString()}, the appraisal
                you edited least recently is removed to make room for a new one. Export a backup if
                you want to keep the older ones.
              </p>
            ) : null}
            {recent.length > 0 ? (
              <>
                <h3 class="options__subheading">Most recent</h3>
                <ul class="options__list">
                  {recent.map((item) => (
                    <li class="options__list-item" key={item.pmid}>
                      <span class="options__list-title">
                        {item.citation.title || `PMID ${item.pmid}`}
                      </span>
                      <span class="options__list-meta">
                        PMID {item.pmid} · edited {formatDate(item.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                {count > recent.length ? (
                  <p class="options__note">…and {plural(count - recent.length, 'more', 'more')}.</p>
                ) : null}
              </>
            ) : null}
          </>
        )}

        <h3 class="options__subheading">Export</h3>
        <p class="options__note">
          Writes every appraisal and your usage counts to one JSON file in your downloads folder.
          Nothing is uploaded: the file is built in this page and handed straight to the browser.
        </p>
        <div class="options__actions">
          <button
            class="button options__button--primary"
            type="button"
            onClick={() => void handleExport()}
            disabled={busy || loading}
          >
            Export all
          </button>
        </div>

        <h3 class="options__subheading">Import</h3>
        <p class="options__note">Choose what should happen to what is already saved here.</p>
        <fieldset class="options__choices">
          <legend class="options__legend">When importing a backup</legend>
          <label class="options__choice">
            <input
              type="radio"
              name="import-mode"
              checked={importMode === 'merge'}
              onChange={() => setImportMode('merge')}
              disabled={busy}
            />
            <span class="options__choice-text">
              <span class="options__choice-title">Merge (recommended)</span>
              <span class="options__choice-hint">
                Keeps what is saved here and adds the appraisals from the file. If both have the
                same article, the newer version is kept and the older one is skipped.
              </span>
            </span>
          </label>
          <label class="options__choice">
            <input
              type="radio"
              name="import-mode"
              checked={importMode === 'replace'}
              onChange={() => setImportMode('replace')}
              disabled={busy}
            />
            <span class="options__choice-text">
              <span class="options__choice-title">Replace</span>
              <span class="options__choice-hint">
                Deletes every appraisal saved here first, then loads the file. Anything saved here
                that is not in the file is gone. A backup containing only usage counts keeps all
                existing appraisals.
              </span>
            </span>
          </label>
        </fieldset>
        <p class="options__note">
          Merging keeps the higher of the two usage counts below; replacing takes the counts from
          the file.
        </p>
        <div class="options__actions">
          <button
            class="button"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Choose a backup file…
          </button>
          <input
            class="options__file-input"
            type="file"
            accept="application/json,.json"
            ref={fileRef}
            onChange={() => void handleFileChosen()}
          />
        </div>

        <h3 class="options__subheading">Delete</h3>
        {confirmingDelete ? (
          <div class="options__confirm" role="group" aria-label="Confirm deleting all appraisals">
            <p class="options__confirm-text">
              Delete {plural(count, 'saved appraisal', 'saved appraisals')}? They are stored only in
              this browser, on this device. There is no copy on a server and no account to restore
              from, so this cannot be undone. Export a backup first if there is any chance you want
              them back.
            </p>
            <div class="options__actions">
              <button
                class="button"
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                class="button options__button--danger"
                type="button"
                onClick={() => void handleDeleteAll()}
                disabled={busy}
              >
                Yes, delete everything
              </button>
            </div>
          </div>
        ) : (
          <>
            <p class="options__note">
              Removes every saved appraisal from this browser. Your usage counts are kept.
            </p>
            <div class="options__actions">
              <button
                class="button options__button--danger"
                type="button"
                onClick={() => {
                  setMessage(null);
                  setConfirmingDelete(true);
                }}
                disabled={busy || loading || count === 0}
              >
                Delete all appraisals
              </button>
            </div>
          </>
        )}

        <p
          class={`options__message${message ? ` options__message--${message.tone}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {message ? message.text : null}
        </p>
      </section>

      {/* ------------------------------------------------------------- usage */}
      <section class="options__section" aria-labelledby="usage-heading">
        <h2 class="options__heading" id="usage-heading">
          Usage (stored only on this device)
        </h2>
        <p class="options__note">
          These numbers never leave your browser. This version contains no analytics and no tracking
          of any kind, this page makes no network requests at all, and there is no server to send
          them to — check the Network tab in developer tools if you want to see for yourself. They
          are counted here only so you can see them, and they disappear when you remove the
          extension.
        </p>
        <dl class="options__stats">
          <div class="options__stat">
            <dt class="options__stat-label">Side panel opened</dt>
            <dd class="options__stat-value">
              {(settings?.counters.panelOpens ?? 0).toLocaleString()}
            </dd>
          </div>
          <div class="options__stat">
            <dt class="options__stat-label">Summaries exported</dt>
            <dd class="options__stat-value">
              {(settings?.counters.exports ?? 0).toLocaleString()}
            </dd>
          </div>
          <div class="options__stat">
            <dt class="options__stat-label">AI runs</dt>
            <dd class="options__stat-value">{(settings?.counters.aiRuns ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
        <p class="options__note">
          AI runs stay at 0 in this version: the AI features arrive in a later version and are not
          part of what you have installed.
        </p>
      </section>

      {/*
        EXTENSION POINT — v0.2, issues #35 (API key) and #36 (license).

        Add both here, between "Usage" and "About", as two more
        <section class="options__section"> blocks reusing the markup already in
        this file (options__heading / options__subheading / options__note /
        options__actions / options__message), so the page does not have to be
        redesigned:

          #35 "AI features (your own API key)"
              - a <input type="password"> plus Save / Remove, and the estimated
                tokens and cost per run that spec §4.7 asks for.
              - The key goes into Settings through saveSettings() in
                src/lib/storage.ts, i.e. chrome.storage.local. Never
                chrome.storage.sync — ESLint fails the build on it (spec §4.6) —
                and it stays out of exportAll() unless pickSettings() in
                storage.ts is deliberately widened to include it, which would
                put the key in a plain file the user may email to themselves.
          #36 "License"
              - plan, current status, and a Manage / Restore purchase button
                going through src/lib/license.ts (spec §4.8). The paid check is
                cached locally, so this section must still render offline.

        Both change the privacy wording above: a license check or a "test this
        key" button IS a network request, so the sentence "this page makes no
        network requests at all" has to move into the sections that still make
        none, and the new sections have to say plainly which button talks to
        which provider and what is sent.
      */}

      {/* ------------------------------------------------------------- about */}
      <section class="options__section" aria-labelledby="about-heading">
        <h2 class="options__heading" id="about-heading">
          About
        </h2>
        <p class="options__note">
          {PRODUCT_NAME}
          {extensionVersion() ? ` — version ${extensionVersion()}` : ' — development build'}
        </p>
        <p class="options__about">
          {PRODUCT_NAME} is an educational aid for critical appraisal, for journal club and for
          learning to read a paper. It is not clinical decision support: it gives no recommendation,
          no interpretation and no clinical advice, and it must not be used to make a decision about
          a patient. It also does not summarize papers. It gives you the appraisal template — PICO,
          the study design, the absolute effect with NNT, a validity checklist — and you fill it in,
          so every judgement in the summary is yours. Check what you write against the full text.
        </p>
        <p class="options__note">Not affiliated with NLM / NIH.</p>
        <ul class="options__links">
          <li>
            {/* TODO(#28): swap PRIVACY_URL for the published privacy policy URL. */}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer noopener">
              Privacy policy
            </a>
          </li>
          <li>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
              Report a problem or suggest something
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
