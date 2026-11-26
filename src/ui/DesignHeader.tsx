/**
 * Study design: what was detected, why, and the manual overrides (issue #8, spec §3-3).
 *
 * The detection is a rule-based guess, so the panel shows the phrase that drove
 * it and lets the user disagree in one click. It never classifies on render —
 * `runClassification` is called once when the article binds — and it never
 * claims a design it does not have: with nothing detected the line says so and
 * asks the user to choose.
 *
 * The subtype is shown on its own line rather than in parentheses after the
 * design, because it is a second fact about one design and not a design of its
 * own: a non-inferiority trial is a randomised controlled trial. It has its own
 * control because the extra checks it switches on in the appraisal are
 * otherwise unreachable when the classifier misses the wording.
 */
import { STUDY_DESIGNS } from '../lib/types';
import type { DesignClassification, StudyDesign } from '../lib/types';
import { useDesign } from './hooks/useDesign';
import type { Messages } from '../locales';
import { useMessages } from './i18n';
import { subtypeLine } from './labels';
import { useStore } from './store';
import './design-header.css';

const DESIGN_SELECT_ID = 'jch-design-override';
const SUBTYPE_SELECT_ID = 'jch-subtype-override';

/**
 * The <option> value for "no subtype". Stored as an override it means the
 * reader looked and says this study has none, which is not the same as `null`
 * — `null` means "no override", i.e. whatever detection found still stands.
 */
const NO_SUBTYPE = '';

/**
 * Trials and reviews are the only designs with subtypes that change the
 * checklist, so the control is hidden for the rest rather than offering a list
 * of things none of which apply. A non-randomised trial can be laid out like a
 * randomised one, so it gets the same choices.
 */
const TRIAL_SUBTYPES: readonly string[] = [
  'parallel',
  'crossover',
  'cluster',
  'non-inferiority',
  'equivalence',
];

const REVIEW_SUBTYPES: readonly string[] = [
  'systematic-review',
  'meta-analysis',
  'network-meta-analysis',
];

const SUBTYPE_CHOICES: Partial<Record<StudyDesign, readonly string[]>> = {
  rct: TRIAL_SUBTYPES,
  'non-randomized-trial': TRIAL_SUBTYPES,
  'sr-ma': REVIEW_SUBTYPES,
};

function toDesign(value: string): StudyDesign | null {
  return STUDY_DESIGNS.find((design) => design === value) ?? null;
}

/**
 * What the detection said, when that is no longer what is on screen. Shown in
 * the evidence disclosure so the listed phrases are not read as support for a
 * choice the user made.
 */
function detectionNote(
  detected: DesignClassification,
  design: StudyDesign,
  subtype: string | null,
  m: Messages,
): string | null {
  if (detected.design !== design) {
    const line = detected.subtype === null ? '' : ` · ${subtypeLine(detected.subtype, m)}`;
    return m.design.suggested(`${m.labels.design[detected.design]}${line}`);
  }
  // An explicit "no subtype" is the empty string; for this comparison it is the
  // same nothing as a detection that found none.
  const inForce = subtype === NO_SUBTYPE ? null : subtype;
  if (inForce === detected.subtype) return null;
  return detected.subtype === null
    ? m.design.foundNoSubtype
    : m.design.suggested(subtypeLine(detected.subtype, m));
}

export function DesignHeader() {
  const m = useMessages();
  // The bound article outlives an unsupported tab, so the design must not be
  // shown next to a header that says "open an abstract".
  const ready = useStore((s) => s.status === 'ready');
  const {
    classification,
    design,
    subtype,
    detectedSubtype,
    isOverridden,
    isSubtypeOverridden,
    setOverride,
    setSubtype,
    reset,
    resetSubtype,
  } = useDesign();

  if (!ready) return null;

  // `unclear` is the classifier's "I could not tell", never a finding to report.
  const detected = classification && classification.design !== 'unclear' ? classification : null;
  const evidence = classification?.evidence ?? [];
  const badge = isOverridden
    ? m.design.setManually
    : detected
      ? m.labels.confidence[detected.confidence]
      : null;
  const note = detected ? detectionNote(detected, design, subtype, m) : null;

  const choices = SUBTYPE_CHOICES[design] ?? null;
  // A subtype the reader cleared still has to show as their doing, not as silence.
  const subtypeText = subtype
    ? subtypeLine(subtype, m)
    : isSubtypeOverridden
      ? m.design.noSubtype
      : null;
  // The subtype the detection would supply if every override were dropped.
  const fallbackSubtype = isOverridden ? null : detectedSubtype;
  // An unrecognised subtype is still listed, or the select would quietly show
  // the wrong answer for what the checklist is actually using.
  const listed = choices ?? [];
  const extra = subtype && !listed.includes(subtype) ? subtype : null;

  const chooseSubtype = (next: string): void => {
    if (next !== NO_SUBTYPE) {
      setSubtype(next);
      return;
    }
    // Dropping the override is enough when detection has no subtype to fall back to.
    setSubtype(fallbackSubtype === null ? null : NO_SUBTYPE);
  };

  return (
    <div class="design">
      <p class="design__line">
        <span class="design__key">{m.design.key}</span>{' '}
        <span class="design__name">{m.labels.design[design]}</span>
      </p>

      {subtypeText === null ? null : (
        <p class="design__subtype">
          <span class="design__subtype-name">{subtypeText}</span>
          {isSubtypeOverridden ? (
            <>
              {' · '}
              <span class="design__badge design__badge--manual">{m.design.setManually}</span>
            </>
          ) : null}
        </p>
      )}

      {badge === null ? null : (
        <p class="design__source">
          <span class={`design__badge${isOverridden ? ' design__badge--manual' : ''}`}>
            {badge}
          </span>
        </p>
      )}

      {!isOverridden && !detected ? <p class="design__hint">{m.design.notDetectedHint}</p> : null}

      {evidence.length > 0 ? (
        <details class="design__evidence">
          <summary class="design__evidence-summary">{m.design.evidence(evidence.length)}</summary>
          {note === null ? null : <p class="design__evidence-note">{note}</p>}
          <ul class="design__evidence-list">
            {evidence.map((item) => (
              <li class="design__evidence-item" key={`${item.kind}:${item.value}`}>
                <span class="design__evidence-value">{item.value}</span>
                {' · '}
                <span class="design__evidence-kind">{m.labels.evidenceKind[item.kind]}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div class="design__controls">
        <label class="design__label" for={DESIGN_SELECT_ID}>
          {m.design.design}
        </label>
        <select
          id={DESIGN_SELECT_ID}
          class="design__select"
          value={design}
          onChange={(event) => {
            const next = toDesign(event.currentTarget.value);
            if (next) setOverride(next);
          }}
        >
          {STUDY_DESIGNS.map((option) => (
            <option key={option} value={option}>
              {option === 'unclear' ? m.labels.designUnclearOption : m.labels.design[option]}
            </option>
          ))}
        </select>

        {choices === null ? null : (
          <>
            <label class="design__label" for={SUBTYPE_SELECT_ID}>
              {m.design.subtype}
            </label>
            <select
              id={SUBTYPE_SELECT_ID}
              class="design__select"
              value={subtype ?? NO_SUBTYPE}
              onChange={(event) => chooseSubtype(event.currentTarget.value)}
            >
              <option value={NO_SUBTYPE}>{m.design.noSubtype}</option>
              {listed.map((option) => (
                <option key={option} value={option}>
                  {subtypeLine(option, m)}
                </option>
              ))}
              {extra === null ? null : <option value={extra}>{subtypeLine(extra, m)}</option>}
            </select>
          </>
        )}

        {isOverridden || isSubtypeOverridden ? (
          <div class="design__actions">
            <button
              class="button design__reset"
              type="button"
              onClick={isOverridden ? reset : resetSubtype}
            >
              {m.design.reset}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
