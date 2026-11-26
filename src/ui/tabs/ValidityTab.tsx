/**
 * Critical appraisal tab (issue #15, spec §3-4 and §4.4).
 *
 * The checklist is picked by the effective design — the header override wins
 * over detection — and answers are written to the store under the *checklist*
 * id, not the design id. Two consequences the rest of the tab depends on:
 *
 *   - Switching the design in the header and switching back restores the
 *     answers, because the record for the old checklist is never touched.
 *   - `non-randomized-trial` resolves to the RCT checklist (see
 *     checklist-schema.ts), so it shares the RCT answers on purpose.
 *
 * Four rules shape everything below, and none of them is a matter of taste.
 *
 * 1. Absence of reporting is not a methodological failure. A reader working
 *    from an abstract cannot settle allocation concealment, so the tab says
 *    which document would settle it (`EVIDENCE_NEED_HINTS`) instead of letting
 *    the resulting Unclear read as a criticism of the study.
 * 2. Every judgement is only as good as what it was read in. The appraisal
 *    carries one source scope, each item inherits it, and any item can be
 *    overridden on its own — shown as the inherited label, never as a blank.
 * 3. Applicability is not internal validity. They are separate sections with
 *    their own headings and their own one-line framing, so the difference is
 *    visible and not merely structural.
 * 4. Funding is a fact, not a finding. The info panel sits outside the scored
 *    sections and has no verdict control anywhere in it: industry money is
 *    something a journal club should know, not a risk-of-bias score.
 *
 * Nothing here defaults a verdict. An item the reader has not judged has to
 * stay visibly unjudged: that is the whole point of the screen, and it is what
 * the progress line and the dashed left edge of an unanswered card report.
 */
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import {
  VERDICT_HELP,
  emptyAnswer,
  getChecklist,
  itemsInSection,
  needsMoreThan,
  visibleItems,
} from '../../lib/checklist-schema';
import type { ChecklistItem, InfoPanel, ItemAnswer, SourceScope, Verdict } from '../../lib/types';
import { useMessages } from '../i18n';
import { SOURCE_SCOPE_ORDER, designLabel } from '../labels';
import { actions, effectiveDesign, effectiveSubtype, useStore } from '../store';
import './validity.css';

/** Display order of the three choices. */
const VERDICTS: readonly Verdict[] = ['yes', 'no', 'unclear'];

/** Stand-in for an item the store has never heard of; never mutated. */
const UNANSWERED: ItemAnswer = Object.freeze(emptyAnswer());

/** The per-item source <option> that means "whatever the appraisal is scoped to". */
const INHERIT = '';

/** Only ever valid source strings reach the store, without a cast. */
function toScope(value: string): SourceScope | null {
  return SOURCE_SCOPE_ORDER.find((scope) => scope === value) ?? null;
}

/** "allocation-concealment" -> "Allocation concealment" */
function conceptLabel(concept: string): string {
  const words = concept.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ---------------------------------------------------------------------- item */

interface ValidityItemProps {
  checklistId: string;
  item: ChecklistItem;
  /** 1-based, continuous down the screen so it matches the progress line. */
  number: number;
  answer: ItemAnswer;
  /** The appraisal-wide scope this item inherits when it has no override. */
  scope: SourceScope;
}

function ValidityItem({ checklistId, item, number, answer, scope }: ValidityItemProps) {
  const m = useMessages();
  // The note disclosure opens on demand, and also whenever a note already
  // exists (restored from storage). It is deliberately not closed again when
  // the text is deleted, so the box cannot collapse under the caret.
  const [noteOpen, setNoteOpen] = useState(false);

  const label = conceptLabel(item.concept);
  const hasNote = answer.note.length > 0;
  const state = answer.verdict ?? 'unanswered';
  const groupName = `jch-verdict-${checklistId}-${item.id}`;

  // What this item was actually read in, which is what decides the hint below.
  const source = answer.source ?? scope;
  const inherited = answer.source === null;
  const needsMore = needsMoreThan(item, source);
  const lookFor = item.lookFor ?? [];

  return (
    <li class={`validity-item validity-item--${state}`}>
      <div class="validity-item__head">
        <span class="validity-item__concept">{`${number} · ${label}`}</span>
        {answer.verdict === null ? (
          <span class="validity-item__flag">{m.validity.unanswered}</span>
        ) : (
          <button
            class="validity-item__clear"
            type="button"
            onClick={() => actions.setVerdict(checklistId, item.id, null)}
            aria-label={m.validity.clearAnswer(label)}
          >
            {m.validity.clear}
          </button>
        )}
      </div>

      <fieldset class="validity-item__fieldset">
        <legend class="validity-item__question">{item.question}</legend>
        <div class="validity-choices">
          {VERDICTS.map((verdict) => (
            <label key={verdict} class={`validity-choice validity-choice--${verdict}`}>
              <input
                class="validity-choice__input"
                type="radio"
                name={groupName}
                value={verdict}
                checked={answer.verdict === verdict}
                onChange={() => actions.setVerdict(checklistId, item.id, verdict)}
              />
              <span class="validity-choice__face">{m.labels.verdict[verdict]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label class={`validity-source${inherited ? '' : ' validity-source--custom'}`}>
        <span class="validity-source__label">{m.validity.readIn}</span>
        <select
          class="validity-source__select"
          value={answer.source ?? INHERIT}
          onChange={(event) =>
            actions.setValidityAnswer(checklistId, item.id, {
              source: toScope(event.currentTarget.value),
            })
          }
        >
          {/* The scope name leads, so the inherited source survives the ellipsis
              when the select is narrower than the wording. */}
          <option value={INHERIT}>{m.validity.inherited(m.labels.sourceScope[scope])}</option>
          {SOURCE_SCOPE_ORDER.map((option) => (
            <option key={option} value={option}>
              {m.labels.sourceScope[option]}
            </option>
          ))}
        </select>
      </label>

      {/* Not a warning about the study: a note about what this source can settle. */}
      {needsMore ? <p class="validity-item__need">{m.labels.evidenceNeed[item.needs]}</p> : null}

      <div class="validity-item__tools">
        {lookFor.length > 0 ? (
          <details class="validity-disclosure">
            <summary class="validity-disclosure__summary">{m.validity.lookFor}</summary>
            <ul class="validity-disclosure__body validity-looks">
              {lookFor.map((clue) => (
                <li key={clue} class="validity-looks__item">
                  {clue}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <details class="validity-disclosure">
          <summary class="validity-disclosure__summary">{m.validity.why}</summary>
          <p class="validity-disclosure__body">{item.why}</p>
        </details>
        <details
          class="validity-disclosure"
          open={noteOpen || hasNote}
          onToggle={(event) => setNoteOpen(event.currentTarget.open)}
        >
          <summary class="validity-disclosure__summary">
            {hasNote ? m.validity.note : m.validity.addNote}
          </summary>
          <div class="validity-disclosure__body">
            <textarea
              class="validity-note"
              rows={3}
              value={answer.note}
              aria-label={m.validity.noteFor(label)}
              placeholder={m.validity.notePlaceholder}
              onInput={(event) =>
                actions.setValidityAnswer(checklistId, item.id, { note: event.currentTarget.value })
              }
            />
          </div>
        </details>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------- blocks */

/**
 * One headed run of items. `kind` only decides how the heading looks:
 * `group` is the subtype-specific run, which is *added* to the general items
 * and never replaces them, so it is badged rather than separated.
 */
interface Block {
  key: string;
  kind: 'internal-validity' | 'applicability' | 'group' | 'plain';
  title: string;
  lede?: string;
  note?: string;
  items: ChecklistItem[];
}

interface BlockViewProps {
  block: Block;
  checklistId: string;
  /** Number of the block's first item, 1-based. */
  start: number;
  answers: Record<string, ItemAnswer> | undefined;
  scope: SourceScope;
}

function BlockView({ block, checklistId, start, answers, scope }: BlockViewProps) {
  const m = useMessages();
  const items = (
    <ol class="validity__items">
      {block.items.map((item, index) => (
        <ValidityItem
          key={`${checklistId}:${item.id}`}
          checklistId={checklistId}
          item={item}
          number={start + index}
          answer={answers?.[item.id] ?? UNANSWERED}
          scope={scope}
        />
      ))}
    </ol>
  );

  if (block.kind === 'plain') return items;

  return (
    <section class={`validity-section validity-section--${block.kind}`}>
      <div class="validity-section__head">
        <h3 class="validity-section__title">{block.title}</h3>
        {block.kind === 'group' ? (
          <span class="validity-section__badge">{m.validity.extraChecks}</span>
        ) : null}
      </div>
      {block.lede ? <p class="validity-section__lede">{block.lede}</p> : null}
      {block.note ? <p class="validity-section__note">{block.note}</p> : null}
      {items}
    </section>
  );
}

/* ---------------------------------------------------------------- info panel */

interface InfoPanelViewProps {
  panel: InfoPanel;
  values: Record<string, string>;
}

/**
 * Facts recorded alongside the appraisal. There is no verdict control here and
 * there must never be one: industry funding is a thing to disclose and discuss,
 * not a finding that marks a study down.
 */
function InfoPanelView({ panel, values }: InfoPanelViewProps) {
  const m = useMessages();
  return (
    <section class="validity-info" aria-labelledby="jch-validity-info-title">
      <div class="validity-info__head">
        <h3 class="validity-info__title" id="jch-validity-info-title">
          {panel.title}
        </h3>
        <span class="validity-info__badge">{m.validity.recordedNotScored}</span>
      </div>
      <p class="validity-info__prompt">{panel.prompt}</p>
      <p class="validity-info__why">{panel.why}</p>
      {panel.fields.map((field) => {
        const hintId = `jch-info-hint-${field.id}`;
        return (
          <div key={field.id} class="validity-info__field">
            <label class="validity-info__label">
              <span class="validity-info__label-text">{field.label}</span>
              <textarea
                class="validity-info__input"
                rows={2}
                value={values[field.id] ?? ''}
                aria-describedby={field.hint ? hintId : undefined}
                onInput={(event) => actions.setInfoField(field.id, event.currentTarget.value)}
              />
            </label>
            {field.hint ? (
              <p class="validity-info__hint" id={hintId}>
                {field.hint}
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------------------------- tab */

export function ValidityTab() {
  const m = useMessages();
  const design = useStore(effectiveDesign);
  const subtype = useStore(effectiveSubtype);
  // The whole record is selected rather than one checklist's slice: `useStore`
  // captures the selector once, so a selector closing over the current
  // checklist id would go stale the moment the design changes.
  const validity = useStore((s) => s.validity);
  const scope = useStore((s) => s.sourceScope);
  const info = useStore((s) => s.info);

  // The subtype is what adds the subtype-specific group; without it the group
  // is not in the returned checklist at all, so nothing here has to filter.
  const checklist = getChecklist(design, subtype);
  const answers = validity[checklist.id];

  const internal = itemsInSection(checklist, 'internal-validity');
  const applicability = itemsInSection(checklist, 'applicability');
  const groups = checklist.groups ?? [];

  const blocks: Block[] = [];
  if (internal.length === 0 && applicability.length === 0) {
    // Defensive: a checklist whose items carry no section would otherwise
    // render as an empty tab. Show them, unheaded, rather than lose them.
    if (checklist.items.length > 0) {
      blocks.push({ key: 'items', kind: 'plain', title: checklist.title, items: checklist.items });
    }
  } else if (internal.length > 0) {
    blocks.push({
      key: 'internal-validity',
      kind: 'internal-validity',
      title: m.labels.section['internal-validity'],
      lede: m.validity.sectionLede['internal-validity'],
      items: internal,
    });
  }
  for (const group of groups) {
    blocks.push({
      key: `group:${group.id}`,
      kind: 'group',
      title: group.title,
      note: group.note,
      items: group.items,
    });
  }
  if (applicability.length > 0) {
    blocks.push({
      key: 'applicability',
      kind: 'applicability',
      title: m.labels.section.applicability,
      lede: m.validity.sectionLede.applicability,
      items: applicability,
    });
  }

  // Numbering runs down the screen, across the sections, so the number on a
  // card and the total in the progress line are the same series.
  const numbered: { block: Block; start: number }[] = [];
  let next = 1;
  for (const block of blocks) {
    numbered.push({ block, start: next });
    next += block.items.length;
  }

  // Scored items only: the info panel is not an item and is never counted.
  const scored = visibleItems(checklist);
  let answered = 0;
  let noCount = 0;
  let unclearCount = 0;
  for (const item of scored) {
    const verdict = answers?.[item.id]?.verdict ?? null;
    if (verdict === null) continue;
    answered += 1;
    if (verdict === 'no') noCount += 1;
    else if (verdict === 'unclear') unclearCount += 1;
  }

  // "5 of 13 answered · 2 No · 1 Unclear" — the No and Unclear tallies are the
  // items a journal club actually spends its hour on, so they are the ones
  // carried in the line and the ones given colour. A tally of zero is dropped
  // rather than printed as "0 No".
  const parts: { key: string; text: string; tone: string }[] = [
    { key: 'answered', text: m.validity.answered(answered, scored.length), tone: '' },
  ];
  if (noCount > 0) {
    parts.push({
      key: 'no',
      text: m.validity.tally(noCount, m.labels.verdict.no),
      tone: ' validity__count--no',
    });
  }
  if (unclearCount > 0) {
    parts.push({
      key: 'unclear',
      text: m.validity.tally(unclearCount, m.labels.verdict.unclear),
      tone: ' validity__count--unclear',
    });
  }

  return (
    <section class="validity" aria-labelledby="jch-validity-title">
      <div class="validity__head">
        <h2 class="validity__title" id="jch-validity-title">
          {m.validity.title}
        </h2>
        {design === 'unclear' ? null : (
          <p class="validity__design">{designLabel(design, subtype, m)}</p>
        )}
      </div>

      <p class="validity__progress" role="status">
        {parts.map((part, index) => (
          <Fragment key={part.key}>
            {index > 0 ? (
              <span class="validity__separator" aria-hidden="true">
                {' · '}
              </span>
            ) : null}
            <span class={`validity__count${part.tone}`}>{part.text}</span>
          </Fragment>
        ))}
      </p>

      <div class="validity-scope">
        <label class="validity-scope__label">
          <span class="validity-scope__title">{m.validity.scopeTitle}</span>
          <select
            class="validity-scope__select"
            value={scope}
            onChange={(event) => {
              const picked = toScope(event.currentTarget.value);
              if (picked !== null) actions.setSourceScope(picked);
            }}
          >
            {SOURCE_SCOPE_ORDER.map((option) => (
              <option key={option} value={option}>
                {m.labels.sourceScope[option]}
              </option>
            ))}
          </select>
        </label>
        <p class="validity-scope__hint">{m.validity.scopeHint}</p>
      </div>

      <p class="validity__lede">{m.validity.lede}</p>

      <details class="validity-help">
        <summary class="validity-help__summary">{m.validity.helpSummary}</summary>
        <dl class="validity-help__list">
          {VERDICTS.map((verdict) => (
            <Fragment key={verdict}>
              <dt class="validity-help__term">{m.labels.verdict[verdict]}</dt>
              <dd class="validity-help__desc">{VERDICT_HELP[verdict]}</dd>
            </Fragment>
          ))}
        </dl>
      </details>

      {design === 'unclear' ? <p class="validity__hint">{m.validity.designNotDetected}</p> : null}

      {checklist.note ? <p class="validity__note">{checklist.note}</p> : null}

      {numbered.map(({ block, start }) => (
        <BlockView
          key={block.key}
          block={block}
          checklistId={checklist.id}
          start={start}
          answers={answers}
          scope={scope}
        />
      ))}

      {checklist.info ? <InfoPanelView panel={checklist.info} values={info} /> : null}
    </section>
  );
}
