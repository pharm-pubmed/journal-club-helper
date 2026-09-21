/**
 * Study design: what was detected, why, and the manual override (issue #8, spec §3-3).
 *
 * The detection is a rule-based guess, so the panel shows the phrase that drove
 * it and lets the user disagree in one click. It never classifies on render —
 * `runClassification` is called once when the article binds — and it never
 * claims a design it does not have: with nothing detected the line says so and
 * asks the user to choose.
 */
import { STUDY_DESIGNS } from '../lib/types';
import type { DesignEvidence, StudyDesign } from '../lib/types';
import { useDesign } from './hooks/useDesign';
import { CONFIDENCE_LABELS, DESIGN_OPTION_LABELS, designLabel } from './labels';
import { useStore } from './store';
import './design-header.css';

const SELECT_ID = 'jch-design-override';

/** Read inline after the phrase itself: `randomized · abstract keyword`. */
const EVIDENCE_KIND_LABELS: Record<DesignEvidence['kind'], string> = {
  'publication-type': 'publication type',
  keyword: 'abstract keyword',
};

const NOT_DETECTED_HINT =
  'Nothing in the publication types or the abstract wording matched a study design. Choose one below so the checklist and the export match this article.';

function toDesign(value: string): StudyDesign | null {
  return STUDY_DESIGNS.find((design) => design === value) ?? null;
}

export function DesignHeader() {
  // The bound article outlives an unsupported tab, so the design must not be
  // shown next to a header that says "open an abstract".
  const ready = useStore((s) => s.status === 'ready');
  const { classification, design, subtype, isOverridden, setOverride, reset } = useDesign();

  if (!ready) return null;

  // `unclear` is the classifier's "I could not tell", never a finding to report.
  const detected = classification && classification.design !== 'unclear' ? classification : null;
  const evidence = classification?.evidence ?? [];
  const badge = isOverridden
    ? 'Set manually'
    : detected
      ? CONFIDENCE_LABELS[detected.confidence]
      : null;

  return (
    <div class="design">
      <p class="design__line">
        <span class="design__key">Study design:</span>{' '}
        <span class="design__name">{designLabel(design, subtype)}</span>
        {badge === null ? null : (
          <>
            {' · '}
            <span class={`design__badge${isOverridden ? ' design__badge--manual' : ''}`}>
              {badge}
            </span>
          </>
        )}
      </p>

      {!isOverridden && !detected ? <p class="design__hint">{NOT_DETECTED_HINT}</p> : null}

      {evidence.length > 0 ? (
        <details class="design__evidence">
          <summary class="design__evidence-summary">Evidence ({evidence.length})</summary>
          {isOverridden && detected ? (
            <p class="design__evidence-note">
              Detection suggested {designLabel(detected.design, detected.subtype)}.
            </p>
          ) : null}
          <ul class="design__evidence-list">
            {evidence.map((item) => (
              <li class="design__evidence-item" key={`${item.kind}:${item.value}`}>
                <span class="design__evidence-value">{item.value}</span>
                {' · '}
                <span class="design__evidence-kind">{EVIDENCE_KIND_LABELS[item.kind]}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div class="design__controls">
        <label class="design__label" for={SELECT_ID}>
          Change design
        </label>
        <select
          id={SELECT_ID}
          class="design__select"
          value={design}
          onChange={(event) => {
            const next = toDesign(event.currentTarget.value);
            if (next) setOverride(next);
          }}
        >
          {STUDY_DESIGNS.map((option) => (
            <option key={option} value={option}>
              {DESIGN_OPTION_LABELS[option]}
            </option>
          ))}
        </select>
        {isOverridden ? (
          <button class="button design__reset" type="button" onClick={reset}>
            Reset to detected
          </button>
        ) : null}
      </div>
    </div>
  );
}
