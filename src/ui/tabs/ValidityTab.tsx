/**
 * Validity tab (issue #15, spec §3-4 and §4.4).
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
 * Nothing here defaults a verdict. An item the reader has not judged has to
 * stay visibly unjudged: that is the whole point of the screen, and it is what
 * the progress line and the dashed left edge of an unanswered card report.
 */
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { VERDICT_HELP, getChecklist } from '../../lib/checklist-schema';
import type { ChecklistItem, ItemAnswer, Verdict } from '../../lib/types';
import { VERDICT_LABELS } from '../labels';
import { actions, effectiveDesign, useStore } from '../store';
import './validity.css';

/** Display order of the three choices. */
const VERDICTS: readonly Verdict[] = ['yes', 'no', 'unclear'];

/** Stand-in for an item the store has never heard of; never mutated. */
const UNANSWERED: ItemAnswer = Object.freeze({ verdict: null, note: '' });

/** "allocation-concealment" -> "Allocation concealment" */
function conceptLabel(concept: string): string {
  const words = concept.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface ValidityItemProps {
  checklistId: string;
  item: ChecklistItem;
  /** Zero-based; shown to the reader as 1-based so it matches the progress line. */
  index: number;
  answer: ItemAnswer;
}

function ValidityItem({ checklistId, item, index, answer }: ValidityItemProps) {
  // The note disclosure opens on demand, and also whenever a note already
  // exists (restored from storage). It is deliberately not closed again when
  // the text is deleted, so the box cannot collapse under the caret.
  const [noteOpen, setNoteOpen] = useState(false);

  const label = conceptLabel(item.concept);
  const hasNote = answer.note.length > 0;
  const state = answer.verdict ?? 'unanswered';
  const groupName = `jch-verdict-${checklistId}-${item.id}`;

  return (
    <li class={`validity-item validity-item--${state}`}>
      <div class="validity-item__head">
        <span class="validity-item__concept">{`${index + 1} · ${label}`}</span>
        {answer.verdict === null ? (
          <span class="validity-item__flag">Unanswered</span>
        ) : (
          <button
            class="validity-item__clear"
            type="button"
            onClick={() => actions.setVerdict(checklistId, item.id, null)}
            aria-label={`Clear the answer for ${label}`}
          >
            Clear
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
              <span class="validity-choice__face">{VERDICT_LABELS[verdict]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div class="validity-item__tools">
        <details class="validity-disclosure">
          <summary class="validity-disclosure__summary">Why it matters</summary>
          <p class="validity-disclosure__body">{item.why}</p>
        </details>
        <details
          class="validity-disclosure"
          open={noteOpen || hasNote}
          onToggle={(event) => setNoteOpen(event.currentTarget.open)}
        >
          <summary class="validity-disclosure__summary">{hasNote ? 'Note' : 'Add a note'}</summary>
          <div class="validity-disclosure__body">
            <textarea
              class="validity-note"
              rows={3}
              value={answer.note}
              aria-label={`Note for ${label}`}
              placeholder="What you would raise about this point"
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

export function ValidityTab() {
  const design = useStore(effectiveDesign);
  // The whole record is selected rather than one checklist's slice: `useStore`
  // captures the selector once, so a selector closing over the current
  // checklist id would go stale the moment the design changes.
  const validity = useStore((s) => s.validity);

  const checklist = getChecklist(design);
  const answers = validity[checklist.id];

  let answered = 0;
  let noCount = 0;
  let unclearCount = 0;
  for (const item of checklist.items) {
    const verdict = answers?.[item.id]?.verdict ?? null;
    if (verdict === null) continue;
    answered += 1;
    if (verdict === 'no') noCount += 1;
    else if (verdict === 'unclear') unclearCount += 1;
  }

  // "5 of 9 answered · 2 No · 1 Unclear" — the No and Unclear tallies are the
  // items a journal club actually spends its hour on, so they are the ones
  // carried in the line and the ones given colour. A tally of zero is dropped
  // rather than printed as "0 No".
  const parts: { key: string; text: string; tone: string }[] = [
    { key: 'answered', text: `${answered} of ${checklist.items.length} answered`, tone: '' },
  ];
  if (noCount > 0) {
    parts.push({
      key: 'no',
      text: `${noCount} ${VERDICT_LABELS.no}`,
      tone: ' validity__count--no',
    });
  }
  if (unclearCount > 0) {
    parts.push({
      key: 'unclear',
      text: `${unclearCount} ${VERDICT_LABELS.unclear}`,
      tone: ' validity__count--unclear',
    });
  }

  return (
    <section class="validity" aria-labelledby="jch-validity-title">
      <h2 class="validity__title" id="jch-validity-title">
        {checklist.title}
      </h2>

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

      {design === 'unclear' ? (
        <p class="validity__hint">
          Study design was not detected. Pick one in the header or use this generic checklist.
        </p>
      ) : null}

      {checklist.note ? <p class="validity__note">{checklist.note}</p> : null}

      <details class="validity-help">
        <summary class="validity-help__summary">What Yes, No and Unclear mean</summary>
        <dl class="validity-help__list">
          {VERDICTS.map((verdict) => (
            <Fragment key={verdict}>
              <dt class="validity-help__term">{VERDICT_LABELS[verdict]}</dt>
              <dd class="validity-help__desc">{VERDICT_HELP[verdict]}</dd>
            </Fragment>
          ))}
        </dl>
      </details>

      <ol class="validity__items">
        {checklist.items.map((item, index) => (
          <ValidityItem
            key={`${checklist.id}:${item.id}`}
            checklistId={checklist.id}
            item={item}
            index={index}
            answer={answers?.[item.id] ?? UNANSWERED}
          />
        ))}
      </ol>
    </section>
  );
}
