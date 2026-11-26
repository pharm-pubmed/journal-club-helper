/**
 * Export tab (issue #20, spec §3-4 Export and §4.5).
 *
 * The end of the workflow: the user writes the one thing the product refuses to
 * write for them, checks the summary, and takes it out of the extension.
 *
 * Three decisions worth knowing before editing this file:
 *
 *  1. The bottom line is the user's. Spec §2 and §9 forbid this product from
 *     producing a conclusion, and `summary-builder.ts` copies the field out
 *     verbatim or leaves the section empty. So this tab offers a placeholder
 *     showing the *shape* of a bottom line and nothing more — no template text
 *     is ever written into the field, because a prefilled judgement is the one
 *     thing a journal club would paste without reading.
 *  2. The preview is the export, not a rendering of it. No Markdown renderer
 *     (spec §5 keeps the dependency list bare, and a rendered preview would hide
 *     the pipes and hashes the user is about to paste into their own tool). The
 *     `<pre>` shows the same string the Copy buttons put on the clipboard.
 *  3. Clipboard writes happen synchronously inside the click handler. A side
 *     panel loses the user activation as soon as the handler awaits anything, so
 *     the appraisal is read from the store and the string is built *before*
 *     `writeText` is called, and the counter is incremented afterwards on the
 *     promise. Doing the build after an await works in Chrome today and fails
 *     in enough other places that it is not worth the risk.
 *
 * The disclaimer is appended by the summary builder; this tab must not add a
 * second one (spec §4.5).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { incrementCounter } from '../../lib/counters';
import { buildSummaryMarkdown, buildSummaryText } from '../../lib/summary-builder';
import type { Appraisal } from '../../lib/types';
import type { Messages } from '../../locales';
import { useMessages } from '../i18n';
import { PRODUCT_NAME } from '../labels';
import { actions, store, toAppraisal, useStore } from '../store';
import './export.css';

const SUMMARY_OPTIONS = { productName: PRODUCT_NAME };

/** How long "Copied" stays up. Errors are not cleared on a timer. */
const CONFIRMATION_MS = 2500;

type Tone = 'ok' | 'error';

interface Feedback {
  tone: Tone;
  text: string;
}

/* ------------------------------------------------------------------ helpers */

/** `journal-club-38123456.md`. The PMID is digits, but a file name is never built from unchecked input. */
export function summaryFilename(pmid: string): string {
  const safe = pmid.replace(/[^\w.-]/g, '');
  return `journal-club-${safe === '' ? 'summary' : safe}.md`;
}

function reasonOf(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}

/**
 * A blocked clipboard must never be a dead end: the text is already on screen,
 * selectable, and the download does not need the clipboard at all.
 */
function copyFailure(error: unknown, m: Messages): string {
  return `${m.export.copyBlocked(reasonOf(error))} ${m.export.clipboardFallback}`;
}

/**
 * Blob + a temporary `<a download>`, the same shape as the backup download on
 * the options page. Nothing is uploaded: the file is built here and handed
 * straight to the browser.
 */
function downloadMarkdown(markdown: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
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

/* ---------------------------------------------------------------------- tab */

export function ExportTab() {
  const m = useMessages();
  // The whole state: every tab feeds the summary, so there is no narrower slice
  // to select. The store hands out a new object on each change, which is what
  // drives the preview below.
  const state = useStore((s) => s);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // The panel floor is 320px, where a Markdown table is wider than the screen.
  // Faithful-width is the default (it is what the user is about to paste); the
  // toggle soft-wraps it for reading without changing a character of the text.
  const [wrapped, setWrapped] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `createdAt` never reaches the summary — the builder reads the citation, the
  // answers and the bottom line only — so a value fixed at mount is enough to
  // satisfy `toAppraisal`, and it keeps the preview from depending on the clock.
  const createdAt = useRef(Date.now());

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    };
  }, []);

  /**
   * Rebuilt on every keystroke, deliberately. Building the summary is string
   * concatenation over one checklist — cheaper than the re-render that Preact
   * has already done by the time this runs — and a debounce would let the
   * preview disagree with what the Copy buttons put on the clipboard, which is
   * the one promise this screen makes.
   */
  const appraisal = useMemo(() => toAppraisal(state, createdAt.current), [state]);
  const markdown = useMemo(
    () => (appraisal === null ? '' : buildSummaryMarkdown(appraisal, SUMMARY_OPTIONS)),
    [appraisal],
  );

  function announce(tone: Tone, text: string): void {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setFeedback({ tone, text });
    // A confirmation clears itself; an error stays until the next action, so the
    // instructions for copying by hand do not vanish while they are being read.
    if (tone !== 'ok') return;
    confirmTimer.current = setTimeout(() => {
      confirmTimer.current = null;
      setFeedback(null);
    }, CONFIRMATION_MS);
  }

  /** Read at click time rather than from the render closure: the click is the source of truth. */
  function currentAppraisal(): Appraisal | null {
    return toAppraisal(store.get(), createdAt.current);
  }

  function copy(format: 'markdown' | 'text'): void {
    const current = currentAppraisal();
    if (current === null) {
      announce('error', m.export.noArticle);
      return;
    }

    const text =
      format === 'markdown'
        ? buildSummaryMarkdown(current, SUMMARY_OPTIONS)
        : buildSummaryText(current, SUMMARY_OPTIONS);

    // Undefined outside a secure context, and a stub without writeText in some
    // embedded browsers, so both are checked before it is called.
    const clipboard: Clipboard | undefined =
      typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      announce('error', `${m.export.noClipboard} ${m.export.clipboardFallback}`);
      return;
    }

    let write: Promise<void>;
    try {
      // Synchronous inside the click handler: see the note at the top of the file.
      write = clipboard.writeText(text);
    } catch (error) {
      announce('error', copyFailure(error, m));
      return;
    }

    void write.then(
      () => {
        announce('ok', m.export.copied[format]);
        // Counted only once the text is really on the clipboard: a denied copy
        // is not an export, and spec §7 shows this number back to the user.
        void incrementCounter('exports');
      },
      (error: unknown) => announce('error', copyFailure(error, m)),
    );
  }

  function download(): void {
    const current = currentAppraisal();
    if (current === null) {
      announce('error', m.export.noArticle);
      return;
    }

    const filename = summaryFilename(current.pmid);
    try {
      downloadMarkdown(buildSummaryMarkdown(current, SUMMARY_OPTIONS), filename);
    } catch (error) {
      announce('error', m.export.buildFailed(reasonOf(error)));
      return;
    }
    announce('ok', m.export.saved(filename));
    void incrementCounter('exports');
  }

  if (appraisal === null) {
    return (
      <section class="export" aria-labelledby="jch-export-title">
        <h2 class="export__title" id="jch-export-title">
          {m.export.title}
        </h2>
        <p class="export__empty">{m.export.noArticle}</p>
      </section>
    );
  }

  return (
    <section class="export" aria-labelledby="jch-export-title">
      <h2 class="export__title" id="jch-export-title">
        {m.export.title}
      </h2>

      <div class="export__field">
        <label class="export__label" for="jch-bottom-line">
          {m.export.bottomLine}
        </label>
        <p class="export__hint" id="jch-bottom-line-hint">
          {m.export.bottomLineHint(PRODUCT_NAME)}
        </p>
        <textarea
          class="export__textarea"
          id="jch-bottom-line"
          rows={4}
          value={state.bottomLine}
          placeholder={m.export.bottomLinePlaceholder}
          aria-describedby="jch-bottom-line-hint"
          onInput={(event) => actions.setBottomLine(event.currentTarget.value)}
        />
      </div>

      <div class="export__actions">
        <button
          class="button export__button export__button--primary"
          type="button"
          onClick={() => copy('markdown')}
        >
          {m.export.copyMarkdown}
        </button>
        <button class="button export__button" type="button" onClick={() => copy('text')}>
          {m.export.copyText}
        </button>
        <button class="button export__button" type="button" onClick={download}>
          {m.export.download}
        </button>
      </div>

      <p
        class={`export__status${feedback === null ? '' : ` export__status--${feedback.tone}`}`}
        role="status"
        aria-live="polite"
      >
        {feedback === null ? '' : feedback.text}
      </p>

      <div class="export__preview-head">
        <span class="export__preview-label" id="jch-export-preview-label">
          {m.export.preview}
        </span>
        <label class="export__wrap">
          <input
            type="checkbox"
            checked={wrapped}
            onChange={(event) => setWrapped(event.currentTarget.checked)}
          />
          {m.export.wrap}
        </label>
      </div>

      <pre
        class={`export__preview${wrapped ? ' export__preview--wrap' : ''}`}
        tabIndex={0}
        role="region"
        aria-labelledby="jch-export-preview-label"
      >
        {markdown}
      </pre>
    </section>
  );
}
