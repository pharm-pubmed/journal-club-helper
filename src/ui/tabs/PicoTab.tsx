/**
 * PICO tab (issue #17, spec §3-4).
 *
 * Four things decide the shape of this tab.
 *
 * 1. Nothing is filled in automatically. `findPicoCandidates` matches cue words
 *    ("were randomised to", "placebo", "primary outcome") — it does not read the
 *    abstract. Its precision is decent and its recall is poor, badly so for
 *    Intervention and Comparison, so the highlights are an accelerator and the
 *    real path is the reader selecting a phrase and sending it to a field. The
 *    copy says "suggestions" and never "detected PICO", because calling cue-word
 *    matching extraction would be a lie the reader pays for later.
 * 2. The abstract below is a *copy* rendered inside the panel from
 *    `article.abstract`. The PubMed page DOM is never touched — nothing is
 *    injected into it, nothing in it is restyled (issue #1 B4, spec §3-2). That
 *    is the whole reason the highlighting lives in the side panel at all.
 * 3. The abstract is untrusted page text. Every mark is a real element built
 *    from the candidate offsets; there is no innerHTML anywhere in this file.
 * 4. The panel floor is 320px. The abstract is rendered in one column with
 *    `white-space: pre-wrap` so the structured abstract's "\n\n" breaks survive,
 *    and the viewer collapses when the reader wants the fields back.
 *
 * OVERLAP RULE. Candidates from different fields can cover the same characters
 * ("received placebo" is an I cue and a C cue). Marks are never nested, so one
 * candidate wins the span. Sorted by start ascending, then by longer span, then
 * by field order P, I, C, O, the first one wins; every later candidate that
 * overlaps it is dropped from the text and remembered on the winner as an
 * alternative. Clicking such a mark appends to the winning field and then opens
 * the chooser on the alternatives, so the losing field is still one click away.
 */
import type { ComponentChild } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { findPicoCandidates } from '../../lib/pico-candidates';
import type { AbstractSection, PicoCandidate, PicoField } from '../../lib/types';
import { PICO_LABELS } from '../labels';
import { actions, useStore } from '../store';
import './pico.css';

/* ------------------------------------------------------------------ constants */

const FIELDS: readonly PicoField[] = ['P', 'I', 'C', 'O'] as const;

/** PicoField -> the key it lives under in `state.pico`, and the CSS modifier. */
const KEYS: Record<PicoField, 'p' | 'i' | 'c' | 'o'> = { P: 'p', I: 'i', C: 'c', O: 'o' };

/** Tie-break for the overlap rule; also the order of the legend and the chooser. */
const RANK: Record<PicoField, number> = { P: 0, I: 1, C: 2, O: 3 };

/**
 * Examples, not defaults: these are placeholders and never become a value.
 * Kept short because a 320px panel shows about 40 characters per line.
 */
const PLACEHOLDERS: Record<PicoField, string> = {
  P: 'e.g. adults admitted with pneumonia',
  I: 'e.g. 5 days of oral amoxicillin',
  C: 'e.g. placebo, or 10 days of the same drug',
  O: 'e.g. death within 30 days',
};

/** Matches the width in pico.css; used to keep the chooser inside the panel. */
const CHOOSER_WIDTH = 168;

/** Longest phrase echoed back inside an accessible name before it is cut. */
const PREVIEW_LIMIT = 48;

/** Stable identity so the `useMemo` over sections does not rerun every render. */
const NO_SECTIONS: readonly AbstractSection[] = [];

/* -------------------------------------------------------------------- helpers */

/** A phrase goes into a one-line-ish textarea, so runs of whitespace collapse. */
function collapseSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function preview(text: string): string {
  const flat = collapseSpace(text);
  return flat.length <= PREVIEW_LIMIT ? flat : `${flat.slice(0, PREVIEW_LIMIT - 1)}…`;
}

/** Grows a textarea to fit its content. `scrollHeight` excludes the borders. */
function autoGrow(element: HTMLTextAreaElement | null): void {
  if (element === null) return;
  element.style.height = 'auto';
  const borders = element.offsetHeight - element.clientHeight;
  element.style.height = `${element.scrollHeight + borders}px`;
}

/* ---------------------------------------------------------------------- marks */

interface AbstractMark {
  start: number;
  end: number;
  field: PicoField;
  /** The candidate's full text, which is what a click sends to the field. */
  text: string;
  reason: string;
  /** Fields whose overlapping candidate lost the span (see OVERLAP RULE above). */
  alternatives: PicoField[];
}

/**
 * Resolves the candidate list into a sorted, non-overlapping list of marks.
 *
 * Title candidates carry `start === end === TITLE_OFFSET` (-1) because the title
 * is not part of the abstract — slicing the abstract with them would highlight
 * nothing — so they are filtered out here and offered separately by `TitleOffer`.
 */
function buildMarks(candidates: readonly PicoCandidate[]): AbstractMark[] {
  const fromAbstract = candidates
    .filter((candidate) => candidate.start >= 0 && candidate.end > candidate.start)
    .sort((a, b) => a.start - b.start || b.end - a.end || RANK[a.field] - RANK[b.field]);

  const marks: AbstractMark[] = [];
  for (const candidate of fromAbstract) {
    // Kept marks are disjoint and ordered, so only the last one can overlap.
    const last = marks.length > 0 ? marks[marks.length - 1] : undefined;
    if (last !== undefined && candidate.start < last.end) {
      if (candidate.field !== last.field && !last.alternatives.includes(candidate.field)) {
        last.alternatives.push(candidate.field);
      }
      continue;
    }
    marks.push({
      start: candidate.start,
      end: candidate.end,
      field: candidate.field,
      text: candidate.text,
      reason: candidate.reason,
      alternatives: [],
    });
  }
  return marks;
}

function markTitle(mark: AbstractMark): string {
  const cue =
    mark.reason === 'numeric result'
      ? 'it reports a number in the results'
      : `the abstract says “${mark.reason}”`;
  const also =
    mark.alternatives.length > 0
      ? ` The same words also matched ${mark.alternatives.map((f) => PICO_LABELS[f]).join(' and ')}.`
      : '';
  return `Suggested for ${PICO_LABELS[mark.field]} because ${cue}.${also}`;
}

/* --------------------------------------------------------------------- blocks */

interface Block {
  label: string | null;
  start: number;
  end: number;
}

/**
 * Splits the abstract into labelled blocks so a structured abstract reads like
 * one, with its section headings back in place.
 *
 * types.ts documents `abstract` as the section texts joined with "\n\n". That is
 * checked rather than trusted: if the rejoin does not reproduce the abstract
 * character for character the offsets would be wrong, and one block of plain
 * text with its line breaks preserved is much better than mislabelled sections.
 */
function resolveBlocks(abstract: string, sections: readonly AbstractSection[]): Block[] {
  const whole: Block[] = [{ label: null, start: 0, end: abstract.length }];
  if (sections.length === 0) return whole;
  if (sections.map((section) => section.text).join('\n\n') !== abstract) return whole;

  const blocks: Block[] = [];
  let cursor = 0;
  for (const section of sections) {
    const label = section.label.trim();
    blocks.push({
      label: label.length > 0 ? label : null,
      start: cursor,
      end: cursor + section.text.length,
    });
    cursor += section.text.length + 2;
  }
  return blocks;
}

/* ------------------------------------------------------------------- chooser */

interface Chooser {
  text: string;
  /** Offsets inside the abstract host, which is the positioned ancestor. */
  top: number;
  left: number;
  /** Fields worth a second look; the rest stay available but unemphasised. */
  suggested: PicoField[];
  caption: string;
}

interface Anchor {
  top: number;
  left: number;
}

/**
 * Places the chooser under `rect`, clamped to the host so it cannot push the
 * panel sideways. Both rects are viewport-relative and only their difference is
 * used, so page scrolling does not move the chooser off its phrase.
 */
function anchorFor(host: HTMLElement, rect: DOMRect): Anchor {
  const hostRect = host.getBoundingClientRect();
  const maxLeft = Math.max(0, hostRect.width - CHOOSER_WIDTH);
  return {
    top: rect.bottom - hostRect.top + 4,
    left: Math.min(Math.max(0, rect.left - hostRect.left), maxLeft),
  };
}

/** The current selection, if it is a real range of text inside `host`. */
function readSelectionIn(host: HTMLElement): { text: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return null;
  const text = collapseSpace(selection.toString());
  if (text.length === 0) return null;
  return { text, rect: range.getBoundingClientRect() };
}

function selectionIsCollapsed(): boolean {
  const selection = window.getSelection();
  return selection === null || selection.isCollapsed;
}

/* ------------------------------------------------------------- field textarea */

interface PicoInputProps {
  field: PicoField;
  value: string;
}

function PicoInput({ field, value }: PicoInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = `jch-pico-${KEYS[field]}`;
  const name = PICO_LABELS[field];

  // Click-to-fill writes straight to the store, so the box has to regrow on any
  // change of value, not only while the reader is typing into it.
  useLayoutEffect(() => {
    autoGrow(ref.current);
  }, [value]);

  return (
    <div class={`pico-field pico-field--${KEYS[field]}`}>
      <div class="pico-field__head">
        <label class="pico-field__label" for={id}>
          <span class="pico-field__letter" aria-hidden="true">
            {field}
          </span>
          {name}
        </label>
        {value.length > 0 ? (
          <button
            class="pico-field__clear"
            type="button"
            onClick={() => actions.setPicoField(field, '')}
            aria-label={`Clear ${name}`}
          >
            Clear
          </button>
        ) : null}
      </div>
      <textarea
        id={id}
        ref={ref}
        class="pico-field__input"
        rows={2}
        value={value}
        placeholder={PLACEHOLDERS[field]}
        onInput={(event) => {
          actions.setPicoField(field, event.currentTarget.value);
          autoGrow(event.currentTarget);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- abstract block */

interface AbstractBlockProps {
  abstract: string;
  block: Block;
  marks: readonly AbstractMark[];
  showCandidates: boolean;
  onActivate: (mark: AbstractMark, element: HTMLElement, viaPointer: boolean) => void;
}

function AbstractBlock({ abstract, block, marks, showCandidates, onActivate }: AbstractBlockProps) {
  const nodes: ComponentChild[] = [];

  if (!showCandidates) {
    nodes.push(abstract.slice(block.start, block.end));
  } else {
    let cursor = block.start;
    for (const mark of marks) {
      // A mark is clipped to the block: a numeric-result window can straddle a
      // section break when the abstract has no RESULTS-like label to scope it.
      const start = Math.max(mark.start, block.start);
      const end = Math.min(mark.end, block.end);
      if (end <= start || start < cursor) continue;
      if (start > cursor) nodes.push(abstract.slice(cursor, start));
      nodes.push(
        <mark
          key={`mark-${start}`}
          class={`pico-mark pico-mark--${KEYS[mark.field]}`}
          role="button"
          tabIndex={0}
          title={markTitle(mark)}
          aria-label={`Add “${preview(mark.text)}” to ${PICO_LABELS[mark.field]}`}
          onClick={(event) => onActivate(mark, event.currentTarget, true)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            // Enter on the host opens the selection chooser; a mark handles its own.
            event.stopPropagation();
            onActivate(mark, event.currentTarget, false);
          }}
        >
          {abstract.slice(start, end)}
          <span class="pico-mark__tag" aria-hidden="true">
            {mark.field}
          </span>
        </mark>,
      );
      cursor = end;
    }
    if (cursor < block.end) nodes.push(abstract.slice(cursor, block.end));
  }

  return (
    <div class="pico-abstract__section">
      {block.label === null ? null : <h3 class="pico-abstract__label">{block.label}</h3>}
      <p class="pico-abstract__text">{nodes}</p>
    </div>
  );
}

/* ------------------------------------------------------------------- the tab */

export function PicoTab() {
  const article = useStore((s) => s.article);
  const pico = useStore((s) => s.pico);

  const [viewerOpen, setViewerOpen] = useState(true);
  const [showCandidates, setShowCandidates] = useState(true);
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [status, setStatus] = useState('');

  const hostRef = useRef<HTMLDivElement>(null);
  const chooserRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  /** Set when the chooser is opened from the keyboard, so focus follows it there. */
  const focusChooser = useRef(false);

  const abstract = article?.abstract ?? '';
  const sections = article?.abstractSections ?? NO_SECTIONS;

  const candidates = useMemo(
    () => (article === null ? [] : findPicoCandidates(article)),
    [article],
  );
  const marks = useMemo(() => buildMarks(candidates), [candidates]);
  const blocks = useMemo(() => resolveBlocks(abstract, sections), [abstract, sections]);

  /** The title is not in the abstract, so its candidates cannot be highlighted. */
  const titleOffer = useMemo(() => {
    const fromTitle = candidates.filter((candidate) => candidate.start < 0);
    const first = fromTitle.length > 0 ? fromTitle[0] : undefined;
    if (first === undefined) return null;
    return { text: first.text, fields: fromTitle.map((candidate) => candidate.field) };
  }, [candidates]);

  const counts = useMemo(() => {
    const tally: Record<PicoField, number> = { P: 0, I: 0, C: 0, O: 0 };
    for (const mark of marks) tally[mark.field] += 1;
    return tally;
  }, [marks]);

  const chooserOpen = chooser !== null;

  const closeChooser = (restoreFocus: boolean): void => {
    setChooser(null);
    if (restoreFocus) hostRef.current?.focus();
  };

  const send = (field: PicoField, text: string): void => {
    actions.appendPicoField(field, collapseSpace(text));
    setStatus(`Added to ${PICO_LABELS[field]}.`);
  };

  const openChooser = (
    rect: DOMRect,
    text: string,
    suggested: PicoField[],
    caption: string,
    fromKeyboard: boolean,
  ): void => {
    const host = hostRef.current;
    if (host === null) return;
    const anchor = anchorFor(host, rect);
    focusChooser.current = fromKeyboard;
    setChooser({ text, suggested, caption, top: anchor.top, left: anchor.left });
  };

  const activateMark = (mark: AbstractMark, element: HTMLElement, viaPointer: boolean): void => {
    // A drag-selection that starts and ends inside one mark also fires a click.
    // That is a selection, not a click-to-fill, so the selection chooser wins.
    if (viaPointer && !selectionIsCollapsed()) return;
    send(mark.field, mark.text);
    if (mark.alternatives.length > 0) {
      const rect = element.getBoundingClientRect();
      openChooser(rect, mark.text, mark.alternatives, 'Also add to', !viaPointer);
    } else {
      setChooser(null);
    }
  };

  /** Reads the live selection and opens (or drops) the chooser on it. */
  const syncSelection = (closeWhenEmpty: boolean, fromKeyboard: boolean): void => {
    const host = hostRef.current;
    if (host === null) return;
    const found = readSelectionIn(host);
    if (found === null) {
      if (closeWhenEmpty) setChooser(null);
      return;
    }
    openChooser(found.rect, found.text, [], 'Add the selection to', fromKeyboard);
  };

  // A click anywhere outside the abstract and the chooser dismisses it. Clicks
  // inside are handled by the mark and selection handlers instead.
  useEffect(() => {
    if (!chooserOpen) return;
    const dismiss = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (chooserRef.current?.contains(target) === true) return;
      if (hostRef.current?.contains(target) === true) return;
      setChooser(null);
    };
    document.addEventListener('mousedown', dismiss, true);
    return () => document.removeEventListener('mousedown', dismiss, true);
  }, [chooserOpen]);

  useLayoutEffect(() => {
    if (chooser === null || !focusChooser.current) return;
    focusChooser.current = false;
    firstChoiceRef.current?.focus();
  }, [chooser]);

  // Binding to another article, hiding the marks or folding the viewer away all
  // remove whatever the chooser was pointing at.
  useEffect(() => {
    setChooser(null);
  }, [abstract, viewerOpen, showCandidates]);

  const hasAbstract = abstract.trim().length > 0;

  return (
    <section class="pico" aria-labelledby="jch-pico-title">
      <h2 class="pico__title" id="jch-pico-title">
        Clinical question
      </h2>
      <p class="pico__intro">
        Write the question in your own words. The highlights below are phrases matched by simple cue
        words — suggestions, not extraction. They miss a great deal, so selecting text yourself is
        the main way to fill these in.
      </p>

      <div class="pico__fields">
        {FIELDS.map((field) => (
          <PicoInput key={field} field={field} value={pico[KEYS[field]]} />
        ))}
      </div>

      <p class="pico__status" role="status">
        {status}
      </p>

      {hasAbstract ? (
        <section class="pico-viewer">
          <div class="pico-viewer__bar">
            <button
              class="pico-viewer__toggle"
              type="button"
              aria-expanded={viewerOpen}
              aria-controls="jch-pico-viewer-body"
              onClick={() => setViewerOpen((open) => !open)}
            >
              <span class="pico-viewer__chevron" aria-hidden="true">
                {viewerOpen ? '▾' : '▸'}
              </span>
              Abstract
            </button>
            <label class="pico-viewer__switch">
              <input
                class="pico-viewer__checkbox"
                type="checkbox"
                checked={showCandidates}
                onChange={(event) => setShowCandidates(event.currentTarget.checked)}
              />
              Show candidates
            </label>
          </div>

          <div class="pico-viewer__body" id="jch-pico-viewer-body" hidden={!viewerOpen}>
            <p class="pico-viewer__note">
              A copy of the abstract. The PubMed page itself is never changed.
            </p>

            {showCandidates ? (
              <ul class="pico-legend">
                {FIELDS.map((field) => (
                  <li key={field} class={`pico-legend__item pico-legend__item--${KEYS[field]}`}>
                    <span class="pico-legend__swatch" aria-hidden="true">
                      {field}
                    </span>
                    {PICO_LABELS[field]}
                    <span class="pico-legend__count">{counts[field]}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <details class="pico-help">
              <summary class="pico-help__summary">How to pull text into a field</summary>
              <ul class="pico-help__list">
                <li>Click a highlighted phrase to add it to its field.</li>
                <li>Select any text in the abstract to choose a field for it.</li>
                <li>
                  Keyboard: Tab to a highlight and press Enter. To select free text, turn on caret
                  browsing (F7), select with Shift and the arrow keys, then press Enter.
                </li>
                <li>
                  Adding to a field that already has text appends to it; nothing is overwritten.
                </li>
              </ul>
            </details>

            {titleOffer !== null && showCandidates ? (
              <div class="pico-title-offer">
                <p class="pico-title-offer__text">
                  <span class="pico-title-offer__label">From the title</span>
                  {titleOffer.text}
                </p>
                <div class="pico-title-offer__actions">
                  {titleOffer.fields.map((field) => (
                    <button
                      key={field}
                      class={`pico-choice pico-choice--${KEYS[field]}`}
                      type="button"
                      title={PICO_LABELS[field]}
                      aria-label={`Add the title to ${PICO_LABELS[field]}`}
                      onClick={() => send(field, titleOffer.text)}
                    >
                      {`→ ${field}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              class="pico-abstract"
              ref={hostRef}
              role="region"
              aria-label="Abstract text"
              tabIndex={0}
              onMouseUp={() => syncSelection(true, false)}
              onKeyUp={(event) => {
                const key = event.key;
                const moved = key.startsWith('Arrow') || key === 'Home' || key === 'End';
                if (moved || (event.ctrlKey && key.toLowerCase() === 'a')) {
                  syncSelection(false, false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && chooserOpen) {
                  event.preventDefault();
                  closeChooser(true);
                  return;
                }
                if (event.key !== 'Enter') return;
                if (selectionIsCollapsed()) return;
                event.preventDefault();
                syncSelection(false, true);
              }}
            >
              {blocks.map((block) => (
                <AbstractBlock
                  key={`block-${block.start}`}
                  abstract={abstract}
                  block={block}
                  marks={marks}
                  showCandidates={showCandidates}
                  onActivate={activateMark}
                />
              ))}

              {chooser === null ? null : (
                <div
                  class="pico-chooser"
                  ref={chooserRef}
                  role="group"
                  aria-label="Send this phrase to a PICO field"
                  title={preview(chooser.text)}
                  style={{ top: `${chooser.top}px`, left: `${chooser.left}px` }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    closeChooser(true);
                  }}
                >
                  <span class="pico-chooser__caption">{chooser.caption}</span>
                  <div class="pico-chooser__row">
                    {FIELDS.map((field, index) => (
                      <button
                        key={field}
                        ref={index === 0 ? firstChoiceRef : undefined}
                        class={`pico-choice pico-choice--${KEYS[field]}${
                          chooser.suggested.includes(field) ? ' pico-choice--suggested' : ''
                        }`}
                        type="button"
                        title={PICO_LABELS[field]}
                        aria-label={`Add to ${PICO_LABELS[field]}`}
                        onClick={() => {
                          send(field, chooser.text);
                          closeChooser(true);
                        }}
                      >
                        {field}
                      </button>
                    ))}
                    <button
                      class="pico-chooser__close"
                      type="button"
                      aria-label="Close"
                      onClick={() => closeChooser(true)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p class="pico__empty">
          This page has no abstract text, so there is nothing to highlight. The four fields above
          still work.
        </p>
      )}
    </section>
  );
}
