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
  countUnreadableAppraisals,
  deleteAllAppraisals,
  exportAll,
  importAll,
  listAppraisals,
  loadSettings,
  saveLocalePreference,
} from '../../lib/storage';
import { LOCALE_PREFERENCES, browserLanguage, resolveLocale } from '../../lib/i18n';
import type { Locale, LocalePreference } from '../../lib/i18n';
import type { Appraisal, Settings } from '../../lib/storage';
import type { AppraisalsReplacedMessage } from '../../lib/types';
import { applyPreference, useLocale, useMessages } from '../i18n';
import type { Messages } from '../../locales';
import './options.css';

/** The published policy, generated from docs/PRIVACY.md (HANDOVER §3, _Landing site_). */
const PRIVACY_URL = 'https://pharm-pubmed.github.io/journal-club-helper/privacy/';
const ISSUES_URL = 'https://github.com/pharm-pubmed/journal-club-helper/issues';

type AppraisalSummary = Pick<Appraisal, 'pmid' | 'updatedAt' | 'citation'>;
type ImportMode = 'merge' | 'replace';
type Message = { tone: 'ok' | 'error'; text: string };

/** How many of the most recent appraisals the list shows before collapsing to a count. */
const RECENT_SHOWN = 5;

/* ------------------------------------------------------------------ helpers */

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(ms: number, locale: Locale, m: Messages): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return m.options.unknownDate;
  // The browser's own date format while the page speaks the browser's language,
  // as before #82; a pinned language gets that language's format instead.
  const pinned = resolveLocale('auto', browserLanguage()) !== locale;
  const tag = pinned ? (locale === 'ja' ? 'ja-JP' : 'en-US') : undefined;
  return date.toLocaleDateString(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

/**
 * Tells any open side panel that the appraisals under it changed, so it drops
 * the one it holds in memory and reads storage again (useAutosave.ts). Without
 * this, the panel's next edit wrote a deleted appraisal back. Sent after a
 * failed attempt too, which may have changed some keys before it stopped.
 * With no panel open nobody answers, and that is not an error.
 */
async function announceAppraisalsReplaced(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  const message: AppraisalsReplacedMessage = { type: 'APPRAISALS_REPLACED' };
  try {
    // Inside the try: on a dead extension context this throws synchronously.
    await chrome.runtime.sendMessage(message);
  } catch {
    // Nobody listening, or no one answering: either way there is nothing to do.
  }
}

/* --------------------------------------------------------------------- page */

function preferenceLabel(preference: LocalePreference, m: Messages): string {
  if (preference === 'en') return m.options.languageEnglish;
  if (preference === 'ja') return m.options.languageJapanese;
  return m.options.languageAuto(m.options.languageNames[resolveLocale('auto', browserLanguage())]);
}

export function OptionsPage() {
  const m = useMessages();
  const { locale, preference } = useLocale();
  const [appraisals, setAppraisals] = useState<AppraisalSummary[] | null>(null);
  /** Records the list above hides because this version cannot read them. */
  const [unreadable, setUnreadable] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // refresh() stays stable for its callers, so it reads the current messages
  // through a ref rather than closing over the first render's.
  const messagesRef = useRef(m);
  messagesRef.current = m;

  useEffect(() => {
    document.title = m.options.documentTitle;
  }, [m]);

  async function handleLocale(next: LocalePreference): Promise<void> {
    try {
      await saveLocalePreference(next);
      applyPreference(next);
      // The counters shown below live in the same record, so read it back too.
      setSettings(await loadSettings());
    } catch (error) {
      setMessage({ tone: 'error', text: messageOf(error, m.options.languageSaveError) });
    }
  }

  const refresh = useCallback(async () => {
    try {
      const [list, loaded, hidden] = await Promise.all([
        listAppraisals(),
        loadSettings(),
        countUnreadableAppraisals(),
      ]);
      setAppraisals(list);
      setSettings(loaded);
      setUnreadable(hidden);
      setLoadError(null);
    } catch (error) {
      setAppraisals([]);
      setLoadError(messageOf(error, messagesRef.current.options.loadError));
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
        text: m.options.exported(appraisals?.length ?? 0),
      });
    } catch (error) {
      setMessage({ tone: 'error', text: messageOf(error, m.options.exportError) });
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
      await announceAppraisalsReplaced();
      await refresh();
      setMessage({
        tone: 'ok',
        text: settingsOnly
          ? m.options.countsRestored
          : m.options.importSummary(imported, skipped, importMode),
      });
    } catch (error) {
      // Storage failures can leave a partially applied import. Show the actual
      // saved list and counters alongside the progress reported by the error.
      await announceAppraisalsReplaced();
      await refresh();
      setMessage({
        tone: 'error',
        text: messageOf(error, m.options.importError),
      });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Everything under an appraisal key goes, including the records this version
   * could not read and does not list. Settings are left alone: the usage counts
   * are not part of "your data" in the sense the button promises.
   */
  async function handleDeleteAll(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const { deleted, unreadable: removed } = await deleteAllAppraisals();
      await announceAppraisalsReplaced();
      await refresh();
      setConfirmingDelete(false);
      setMessage({
        tone: 'ok',
        text: m.options.deleted(deleted, removed),
      });
    } catch (error) {
      await announceAppraisalsReplaced();
      await refresh();
      setMessage({ tone: 'error', text: messageOf(error, m.options.deleteError) });
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
        <h1 class="options__title">{m.common.productName}</h1>
        <p class="options__tagline">{m.options.tagline}</p>
      </header>

      {/* ---------------------------------------------------------- language */}
      <section class="options__section" aria-labelledby="language-heading">
        <h2 class="options__heading" id="language-heading">
          {m.options.languageHeading}
        </h2>
        <p class="options__note">{m.options.languageNote}</p>
        <fieldset class="options__choices">
          <legend class="options__legend">{m.options.languageLegend}</legend>
          {LOCALE_PREFERENCES.map((option) => (
            <label class="options__choice" key={option}>
              <input
                type="radio"
                name="locale"
                value={option}
                checked={preference === option}
                onChange={() => void handleLocale(option)}
                disabled={busy}
              />
              <span class="options__choice-text">
                <span class="options__choice-title" lang={option === 'auto' ? undefined : option}>
                  {preferenceLabel(option, m)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      {/* --------------------------------------------------------- your data */}
      <section class="options__section" aria-labelledby="data-heading">
        <h2 class="options__heading" id="data-heading">
          {m.options.dataHeading}
        </h2>

        {loadError ? (
          <p class="options__message options__message--error">{loadError}</p>
        ) : loading ? (
          <p class="options__note">{m.options.reading}</p>
        ) : (
          <>
            <p class="options__count">
              <strong class="options__count-value">{count.toLocaleString()}</strong>
              <span class="options__count-label">
                {m.options.countLabel(count, MAX_APPRAISALS)}
              </span>
            </p>
            {count === 0 && unreadable === 0 ? (
              <p class="options__note">{m.options.nothingSaved}</p>
            ) : null}
            {unreadable > 0 ? (
              <p class="options__note">{m.options.alsoStored(unreadable)}</p>
            ) : null}
            {nearCap ? (
              <p class="options__note options__note--warning">
                {m.options.nearCap(MAX_APPRAISALS)}
              </p>
            ) : null}
            {recent.length > 0 ? (
              <>
                <h3 class="options__subheading">{m.options.mostRecent}</h3>
                <ul class="options__list">
                  {recent.map((item) => (
                    <li class="options__list-item" key={item.pmid}>
                      <span class="options__list-title">
                        {item.citation.title || m.header.pmid(item.pmid)}
                      </span>
                      <span class="options__list-meta">
                        {m.options.listMeta(item.pmid, formatDate(item.updatedAt, locale, m))}
                      </span>
                    </li>
                  ))}
                </ul>
                {count > recent.length ? (
                  <p class="options__note">{m.options.andMore(count - recent.length)}</p>
                ) : null}
              </>
            ) : null}
          </>
        )}

        <h3 class="options__subheading">{m.options.exportHeading}</h3>
        <p class="options__note">{m.options.exportNote}</p>
        <div class="options__actions">
          <button
            class="button options__button--primary"
            type="button"
            onClick={() => void handleExport()}
            disabled={busy || loading}
          >
            {m.options.exportAll}
          </button>
        </div>

        <h3 class="options__subheading">{m.options.importHeading}</h3>
        <p class="options__note">{m.options.importNote}</p>
        <fieldset class="options__choices">
          <legend class="options__legend">{m.options.importLegend}</legend>
          <label class="options__choice">
            <input
              type="radio"
              name="import-mode"
              checked={importMode === 'merge'}
              onChange={() => setImportMode('merge')}
              disabled={busy}
            />
            <span class="options__choice-text">
              <span class="options__choice-title">{m.options.mergeTitle}</span>
              <span class="options__choice-hint">{m.options.mergeHint}</span>
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
              <span class="options__choice-title">{m.options.replaceTitle}</span>
              <span class="options__choice-hint">{m.options.replaceHint}</span>
            </span>
          </label>
        </fieldset>
        <p class="options__note">{m.options.countsNote}</p>
        <div class="options__actions">
          <button
            class="button"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {m.options.chooseFile}
          </button>
          <input
            class="options__file-input"
            type="file"
            accept="application/json,.json"
            ref={fileRef}
            onChange={() => void handleFileChosen()}
          />
        </div>

        <h3 class="options__subheading">{m.options.deleteHeading}</h3>
        {confirmingDelete ? (
          <div class="options__confirm" role="group" aria-label={m.options.confirmLabel}>
            <p class="options__confirm-text">{m.options.confirmText(count, unreadable)}</p>
            <div class="options__actions">
              <button
                class="button"
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
              >
                {m.options.cancel}
              </button>
              <button
                class="button options__button--danger"
                type="button"
                onClick={() => void handleDeleteAll()}
                disabled={busy}
              >
                {m.options.confirmDelete}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p class="options__note">{m.options.deleteNote}</p>
            <div class="options__actions">
              <button
                class="button options__button--danger"
                type="button"
                onClick={() => {
                  setMessage(null);
                  setConfirmingDelete(true);
                }}
                disabled={busy || loading || count + unreadable === 0}
              >
                {m.options.deleteAll}
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
          {m.options.usageHeading}
        </h2>
        <p class="options__note">{m.options.usageNote}</p>
        <dl class="options__stats">
          <div class="options__stat">
            <dt class="options__stat-label">{m.options.panelOpens}</dt>
            <dd class="options__stat-value">
              {(settings?.counters.panelOpens ?? 0).toLocaleString()}
            </dd>
          </div>
          <div class="options__stat">
            <dt class="options__stat-label">{m.options.exports}</dt>
            <dd class="options__stat-value">
              {(settings?.counters.exports ?? 0).toLocaleString()}
            </dd>
          </div>
          <div class="options__stat">
            <dt class="options__stat-label">{m.options.aiRuns}</dt>
            <dd class="options__stat-value">{(settings?.counters.aiRuns ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
        <p class="options__note">{m.options.aiNote}</p>
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
          {m.options.aboutHeading}
        </h2>
        <p class="options__note">
          {m.common.productName}
          {m.options.version(extensionVersion())}
        </p>
        <p class="options__about">{m.options.about(m.common.productName)}</p>
        <p class="options__note">{m.options.notAffiliated}</p>
        <ul class="options__links">
          <li>
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer noopener">
              {m.options.privacy}
            </a>
          </li>
          <li>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
              {m.options.report}
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
