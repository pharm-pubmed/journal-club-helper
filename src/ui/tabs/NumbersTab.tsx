/**
 * Numbers tab (issue #12, spec §3-4, §4.3, §9).
 *
 * The tab turns whatever an abstract happens to report — two percentages, two
 * fractions, or a relative measure — into an absolute difference and an NNT.
 *
 * Three rules shape everything below.
 *
 *   1. Nothing is computed behind the reader's back (spec §9). A result is only
 *      ever written by `commit()`, and every caller of `commit()` is a direct
 *      user action: pressing "Use" on a candidate, submitting the calculator,
 *      or answering the control-group question. Editing a field clears the
 *      result instead of recomputing it, so a number on screen always belongs
 *      to the values next to it.
 *   2. The extractor deliberately refuses to guess which arm is the control
 *      (see number-extractor.ts), so the tab asks. Control and intervention the
 *      wrong way round turns a benefit into a harm silently, which is why the
 *      assignment is a visible question rather than a hidden default.
 *   3. Inputs are kept as raw strings in the store, so the calculator restores
 *      exactly what was typed. Parsing happens once, at calculation time.
 *
 * All arithmetic lives in src/lib/effect-measures.ts; this file only collects
 * input, catches the RangeErrors that module throws (its messages are written
 * for readers) and renders the output. What the design in force does to the
 * meaning of that output is src/lib/design-caveats.ts: this file only places
 * its notes, and blocks nothing on account of them.
 */
import { Fragment, type Ref } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { candidatesCaveat, resultCaveat } from '../../lib/design-caveats';
import { fromCounts, fromRates, fromRatio } from '../../lib/effect-measures';
import { extractNumberCandidates } from '../../lib/number-extractor';
import type {
  CalculatorMode,
  CountsInputs,
  EffectMeasures,
  FractionPairCandidate,
  NumberCandidate,
  NumbersState,
  PercentPairCandidate,
  RatesInputs,
  RatioCandidate,
  RatioInputs,
  RatioMeasure,
} from '../../lib/types';
import type { Messages } from '../../locales';
import { localizeCaveat, localizeWarning, localizedNnt } from '../../locales/numbers';
import { useMessages } from '../i18n';
import { actions, effectiveDesign, emptyNumbers, store, useStore } from '../store';
import './numbers.css';

/* ------------------------------------------------------------------ constants */

const COCHRANE_URL =
  'https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-12#section-12-5';
const CEBM_URL = 'https://www.cebm.ox.ac.uk/resources/ebm-tools/number-needed-to-treat-nnt';

/** Longest sentence shown under a candidate before it is cut. */
const SENTENCE_LIMIT = 120;

const MODES: readonly CalculatorMode[] = ['rates', 'counts', 'ratio'];

const RATIO_MEASURES: readonly RatioMeasure[] = ['RR', 'HR', 'OR'];

/**
 * Which value the calculator treats as the control arm until the reader says
 * otherwise. Abstracts overwhelmingly report the intervention first, so the
 * second value is the safer default — but it is still only a default, and the
 * question stays on screen.
 */
const DEFAULT_CONTROL_SIDE: ControlSide = 'second';

/* ----------------------------------------------------------------- field model */

type ControlSide = 'first' | 'second';

type CalculatorInputs = NumbersState['inputs'];

type FieldName =
  | 'cerPercent'
  | 'eerPercent'
  | 'controlEvents'
  | 'controlTotal'
  | 'interventionEvents'
  | 'interventionTotal'
  | 'estimate'
  | 'ciLow'
  | 'ciHigh'
  | 'acrPercent';

/** Per-field messages plus a `form` slot for anything that names no single field. */
type FieldErrors = Partial<Record<FieldName | 'form', string>>;

type Outcome =
  { ok: true; result: EffectMeasures; warnings: string[] } | { ok: false; errors: FieldErrors };

/**
 * effect-measures.ts prefixes each RangeError with the argument that failed, so
 * the message can be put back next to the field the reader typed it into. The
 * message itself is shown verbatim: it is written for readers, not for logs.
 */
const ARG_FIELDS: readonly (readonly [string, FieldName])[] = [
  ['controlEvents', 'controlEvents'],
  ['controlTotal', 'controlTotal'],
  ['interventionEvents', 'interventionEvents'],
  ['interventionTotal', 'interventionTotal'],
  ['cer', 'cerPercent'],
  ['eer', 'eerPercent'],
  ['ci.low', 'ciLow'],
  ['ci.high', 'ciHigh'],
  ['estimate', 'estimate'],
  ['acr', 'acrPercent'],
];

function errorsFromThrown(thrown: unknown, m: Messages): FieldErrors {
  const raw = thrown instanceof Error ? thrown.message : String(thrown);
  const message = m.numbers.thrown(raw);
  const errors: FieldErrors = {};
  for (const [argName, field] of ARG_FIELDS) {
    if (raw.startsWith(argName)) {
      errors[field] = message;
      return errors;
    }
  }
  errors.form = message;
  return errors;
}

/* --------------------------------------------------------------------- parsing */

interface ParsedField {
  value: number | null;
  error: string | null;
}

function toNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function percentField(raw: string, label: string, m: Messages): ParsedField {
  if (raw.trim().length === 0) return { value: null, error: m.numbers.required(label) };
  const value = toNumber(raw);
  if (value === null) return { value: null, error: m.numbers.enterNumber };
  if (value < 0 || value > 100) return { value: null, error: m.numbers.enterPercent };
  return { value, error: null };
}

function countField(raw: string, label: string, minimum: number, m: Messages): ParsedField {
  if (raw.trim().length === 0) return { value: null, error: m.numbers.required(label) };
  const value = toNumber(raw);
  if (value === null || !Number.isInteger(value)) {
    return { value: null, error: m.numbers.enterWhole };
  }
  if (value < minimum) return { value: null, error: m.numbers.enterWholeMin(minimum) };
  return { value, error: null };
}

function ratioField(raw: string, label: string, m: Messages): ParsedField {
  if (raw.trim().length === 0) return { value: null, error: m.numbers.required(label) };
  const value = toNumber(raw);
  if (value === null) return { value: null, error: m.numbers.enterNumber };
  if (value <= 0) return { value: null, error: m.numbers.enterRatio };
  return { value, error: null };
}

/* ----------------------------------------------------------------- calculation */

function calculateRates(inputs: RatesInputs, m: Messages): Outcome {
  const f = m.numbers.fieldName;
  const errors: FieldErrors = {};
  const cer = percentField(inputs.cerPercent, f.cer, m);
  const eer = percentField(inputs.eerPercent, f.eer, m);
  if (cer.error !== null) errors.cerPercent = cer.error;
  if (eer.error !== null) errors.eerPercent = eer.error;

  const cerValue = cer.value;
  const eerValue = eer.value;
  if (cerValue === null || eerValue === null) return { ok: false, errors };

  try {
    return { ok: true, result: fromRates(cerValue / 100, eerValue / 100), warnings: [] };
  } catch (thrown) {
    return { ok: false, errors: errorsFromThrown(thrown, m) };
  }
}

function calculateCounts(inputs: CountsInputs, m: Messages): Outcome {
  const f = m.numbers.fieldName;
  const errors: FieldErrors = {};
  const controlEvents = countField(inputs.controlEvents, f.controlEvents, 0, m);
  const controlTotal = countField(inputs.controlTotal, f.controlTotal, 1, m);
  const interventionEvents = countField(inputs.interventionEvents, f.interventionEvents, 0, m);
  const interventionTotal = countField(inputs.interventionTotal, f.interventionTotal, 1, m);
  if (controlEvents.error !== null) errors.controlEvents = controlEvents.error;
  if (controlTotal.error !== null) errors.controlTotal = controlTotal.error;
  if (interventionEvents.error !== null) errors.interventionEvents = interventionEvents.error;
  if (interventionTotal.error !== null) errors.interventionTotal = interventionTotal.error;

  const ce = controlEvents.value;
  const ct = controlTotal.value;
  const ie = interventionEvents.value;
  const it = interventionTotal.value;
  if (ce === null || ct === null || ie === null || it === null) return { ok: false, errors };

  try {
    return { ok: true, result: fromCounts(ce, ct, ie, it), warnings: [] };
  } catch (thrown) {
    return { ok: false, errors: errorsFromThrown(thrown, m) };
  }
}

function calculateRatio(inputs: RatioInputs, m: Messages): Outcome {
  const f = m.numbers.fieldName;
  const errors: FieldErrors = {};
  const estimate = ratioField(inputs.estimate, f.estimate(inputs.measure), m);
  const acr = percentField(inputs.acrPercent, f.acr, m);
  if (estimate.error !== null) errors.estimate = estimate.error;
  if (acr.error !== null) errors.acrPercent = acr.error;
  else if (acr.value !== null && (acr.value <= 0 || acr.value >= 100)) {
    errors.acrPercent = m.numbers.enterAcr;
    acr.value = null;
  }

  // The interval is optional, but half an interval is not an interval.
  const hasLow = inputs.ciLow.trim().length > 0;
  const hasHigh = inputs.ciHigh.trim().length > 0;
  let ci: { low: number; high: number } | undefined;
  if (hasLow || hasHigh) {
    const low = ratioField(inputs.ciLow, f.ciLow, m);
    const high = ratioField(inputs.ciHigh, f.ciHigh, m);
    if (low.error !== null) {
      errors.ciLow = hasLow ? low.error : m.numbers.bothEnds;
    }
    if (high.error !== null) {
      errors.ciHigh = hasHigh ? high.error : m.numbers.bothEnds;
    }
    if (low.value !== null && high.value !== null) ci = { low: low.value, high: high.value };
  }

  const estimateValue = estimate.value;
  const acrValue = acr.value;
  if (estimateValue === null || acrValue === null) return { ok: false, errors };
  if (errors.ciLow !== undefined || errors.ciHigh !== undefined) return { ok: false, errors };

  try {
    const measures = fromRatio(inputs.measure, estimateValue, acrValue / 100, ci);
    const { warnings, ...result } = measures;
    return { ok: true, result, warnings };
  } catch (thrown) {
    return { ok: false, errors: errorsFromThrown(thrown, m) };
  }
}

function calculate(mode: CalculatorMode, inputs: CalculatorInputs, m: Messages): Outcome {
  switch (mode) {
    case 'rates':
      return calculateRates(inputs.rates, m);
    case 'counts':
      return calculateCounts(inputs.counts, m);
    case 'ratio':
      return calculateRatio(inputs.ratio, m);
  }
}

/* ------------------------------------------------------------------ candidates */

/** Trailing zeros are never invented: a field reads back as the abstract wrote it. */
function numberText(value: number): string {
  return String(value);
}

function modeForCandidate(candidate: NumberCandidate): CalculatorMode {
  switch (candidate.kind) {
    case 'percent-pair':
      return 'rates';
    case 'fraction-pair':
      return 'counts';
    case 'ratio':
      return 'ratio';
  }
}

function ratesFor(candidate: PercentPairCandidate, control: ControlSide): RatesInputs {
  const controlValue = control === 'first' ? candidate.first : candidate.second;
  const otherValue = control === 'first' ? candidate.second : candidate.first;
  return { cerPercent: numberText(controlValue), eerPercent: numberText(otherValue) };
}

function countsFor(candidate: FractionPairCandidate, control: ControlSide): CountsInputs {
  const first = { events: candidate.aEvents, total: candidate.aTotal };
  const second = { events: candidate.bEvents, total: candidate.bTotal };
  const controlArm = control === 'first' ? first : second;
  const otherArm = control === 'first' ? second : first;
  return {
    controlEvents: numberText(controlArm.events),
    controlTotal: numberText(controlArm.total),
    interventionEvents: numberText(otherArm.events),
    interventionTotal: numberText(otherArm.total),
  };
}

/** The reader's assumed baseline survives switching from one ratio to another. */
function ratioFor(candidate: RatioCandidate, previous: RatioInputs): RatioInputs {
  return {
    measure: candidate.measure,
    estimate: numberText(candidate.estimate),
    ciLow: candidate.ciLow === null ? '' : numberText(candidate.ciLow),
    ciHigh: candidate.ciHigh === null ? '' : numberText(candidate.ciHigh),
    acrPercent: previous.acrPercent,
  };
}

/** How a candidate's two values read in the control-group question. */
function armText(candidate: PercentPairCandidate | FractionPairCandidate, side: ControlSide) {
  if (candidate.kind === 'percent-pair') {
    return `${numberText(side === 'first' ? candidate.first : candidate.second)}%`;
  }
  return side === 'first'
    ? `${candidate.aEvents}/${candidate.aTotal}`
    : `${candidate.bEvents}/${candidate.bTotal}`;
}

/**
 * Which side of the candidate is currently loaded as the control arm, or null
 * once the fields have been edited by hand. Derived from the inputs rather than
 * kept in component state, so the answer survives the tab being unmounted and
 * can never disagree with the fields.
 */
function controlSideOf(candidate: NumberCandidate, inputs: CalculatorInputs): ControlSide | null {
  const sides: readonly ControlSide[] = ['first', 'second'];
  if (candidate.kind === 'percent-pair') {
    const current = inputs.rates;
    return (
      sides.find((side) => {
        const mapped = ratesFor(candidate, side);
        return mapped.cerPercent === current.cerPercent && mapped.eerPercent === current.eerPercent;
      }) ?? null
    );
  }
  if (candidate.kind === 'fraction-pair') {
    const current = inputs.counts;
    return (
      sides.find((side) => {
        const mapped = countsFor(candidate, side);
        return (
          mapped.controlEvents === current.controlEvents &&
          mapped.controlTotal === current.controlTotal &&
          mapped.interventionEvents === current.interventionEvents &&
          mapped.interventionTotal === current.interventionTotal
        );
      }) ?? null
    );
  }
  return null;
}

function isSameCandidate(a: NumberCandidate | null, b: NumberCandidate): boolean {
  return a !== null && a.kind === b.kind && a.start === b.start && a.end === b.end;
}

function truncate(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}

/* ----------------------------------------------------------------- formatting */

function percentText(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function pointsText(rate: number): string {
  return `${(rate * 100).toFixed(1)}`;
}

function rrrText(rrr: number, m: Messages): string {
  if (!Number.isFinite(rrr)) return m.numbers.rrrUndefined;
  return percentText(Math.abs(rrr));
}

/* ------------------------------------------------------------------ components */

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  onValue: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * `type="text"` on purpose: a number input silently reports an empty string for
 * anything it considers invalid, and the store is meant to hold exactly what the
 * reader typed. `inputMode` still brings up a numeric keypad.
 */
function NumberField({
  id,
  label,
  value,
  error,
  onValue,
  suffix,
  placeholder,
  hint,
  inputRef,
}: NumberFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const described = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  return (
    <div class="numbers__field">
      <label class="numbers__label" for={id}>
        {label}
      </label>
      <div class="numbers__control">
        <input
          id={id}
          ref={inputRef}
          class={error ? 'numbers__input numbers__input--invalid' : 'numbers__input'}
          type="text"
          inputMode="decimal"
          autocomplete="off"
          spellcheck={false}
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={described.length > 0 ? described : undefined}
          onInput={(event) => onValue(event.currentTarget.value)}
        />
        {suffix ? (
          <span class="numbers__suffix" aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p class="numbers__field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p class="numbers__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function HowThisIsCalculated() {
  const m = useMessages();
  return (
    <details class="numbers__how">
      <summary class="numbers__how-summary">{m.numbers.howSummary}</summary>
      <div class="numbers__how-body">
        <dl class="numbers__how-list">
          {m.numbers.how.map((entry) => (
            <Fragment key={entry.formula}>
              <dt class="numbers__formula">{entry.formula}</dt>
              <dd class="numbers__how-text">{entry.text}</dd>
            </Fragment>
          ))}
        </dl>

        <p class="numbers__how-text">{m.numbers.howFootnote}</p>

        <ul class="numbers__links">
          <li>
            <a href={COCHRANE_URL} target="_blank" rel="noreferrer noopener">
              {m.numbers.cochrane}
            </a>
          </li>
          <li>
            <a href={CEBM_URL} target="_blank" rel="noreferrer noopener">
              {m.numbers.cebm}
            </a>
          </li>
        </ul>
      </div>
    </details>
  );
}

interface ResultPanelProps {
  mode: CalculatorMode;
  result: EffectMeasures;
  warnings: string[];
  /** From design-caveats.ts; null when the design takes nothing away from the result. */
  caveat: string | null;
}

function ResultPanel({ mode, result, warnings, caveat }: ResultPanelProps) {
  const m = useMessages();
  const ci = result.ci;
  const harm = result.direction === 'harm';
  return (
    <section class="numbers__result" aria-labelledby="jch-numbers-result">
      <h3 class="numbers__heading" id="jch-numbers-result">
        {m.numbers.result}
      </h3>

      <p class={harm ? 'numbers__nnt numbers__nnt--harm' : 'numbers__nnt'}>
        {localizedNnt(result, m)}
      </p>
      <p class="numbers__direction">{m.numbers.direction(result.nnt, harm)}</p>

      {/* Straight after the sentence it qualifies, so the two are read together. */}
      {caveat === null ? null : <p class="numbers__callout">{localizeCaveat(caveat, m)}</p>}

      {ci?.crossesInfinity ? (
        <div class="numbers__callout numbers__callout--flip">
          <strong class="numbers__callout-title">{m.numbers.crossingTitle}</strong>
          {m.numbers
            .crossing(pointsText(ci.arrLow), pointsText(ci.arrHigh), ci.nntLow, ci.nntHigh)
            .map((sentence) => (
              <p class="numbers__callout-text" key={sentence}>
                {sentence}
              </p>
            ))}
        </div>
      ) : null}

      <dl class="numbers__stats">
        <dt class="numbers__stat-label">{m.numbers.cer}</dt>
        <dd class="numbers__stat-value">{percentText(result.cer)}</dd>

        <dt class="numbers__stat-label">{m.numbers.eer}</dt>
        <dd class="numbers__stat-value">{percentText(result.eer)}</dd>

        <dt class="numbers__stat-label">{harm ? m.numbers.ari : m.numbers.arr}</dt>
        <dd class="numbers__stat-value">{m.numbers.points(pointsText(Math.abs(result.arr)))}</dd>

        <dt class="numbers__stat-label">{result.rrr < 0 ? m.numbers.rri : m.numbers.rrr}</dt>
        <dd class="numbers__stat-value">{rrrText(result.rrr, m)}</dd>

        {ci ? (
          <>
            <dt class="numbers__stat-label">{m.numbers.ciForArr}</dt>
            <dd class="numbers__stat-value">
              {m.numbers.ciRange(pointsText(ci.arrLow), pointsText(ci.arrHigh))}
            </dd>
          </>
        ) : null}
      </dl>

      {mode === 'rates' ? <p class="numbers__callout">{m.numbers.ratesNoCi}</p> : null}

      {warnings.map((warning) => (
        <p class="numbers__callout" key={warning}>
          {localizeWarning(warning, m)}
        </p>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------------ tab */

export function NumbersTab() {
  const m = useMessages();
  const article = useStore((s) => s.article);
  const numbers = useStore((s) => s.numbers);
  const design = useStore(effectiveDesign);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [acrFocusToken, setAcrFocusToken] = useState(0);
  const acrRef = useRef<HTMLInputElement>(null);

  const abstract = article?.abstract ?? '';
  const candidates = useMemo(() => extractNumberCandidates(abstract), [abstract]);

  // A ratio candidate cannot be turned into an absolute effect until the reader
  // supplies a baseline, so "Use" sends them straight to that field.
  useEffect(() => {
    if (acrFocusToken === 0) return;
    const input = acrRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [acrFocusToken]);

  const { mode, inputs, result, warnings, sourceCandidate } = numbers;

  /**
   * Handlers derive the next inputs from the *live* store, not from the values
   * captured in this render: two events can land in the same tick (a paste, or
   * typing across two fields inside one frame), and a patch built from a stale
   * render would quietly undo the earlier one.
   */
  const live = (): NumbersState => store.get().numbers;

  /** The single place a result is written. Every caller is a direct user action. */
  const commit = (nextMode: CalculatorMode, nextInputs: CalculatorInputs): void => {
    const outcome = calculate(nextMode, nextInputs, m);
    if (outcome.ok) {
      setErrors({});
      actions.setNumbers({
        mode: nextMode,
        inputs: nextInputs,
        result: outcome.result,
        warnings: outcome.warnings,
      });
      return;
    }
    setErrors(outcome.errors);
    actions.setNumbers({ mode: nextMode, inputs: nextInputs, result: null, warnings: [] });
  };

  /** Editing drops the result: a number on screen must belong to the fields beside it. */
  const edit = (
    field: FieldName,
    patch: (current: CalculatorInputs) => Partial<CalculatorInputs>,
  ): void => {
    setErrors((previous) => {
      if (previous[field] === undefined && previous.form === undefined) return previous;
      const next = { ...previous };
      delete next[field];
      delete next.form;
      return next;
    });
    actions.setNumbers((n) => ({
      inputs: { ...n.inputs, ...patch(n.inputs) },
      result: null,
      warnings: [],
    }));
  };

  const editRates = (field: keyof RatesInputs, value: string): void => {
    edit(field, (current) => ({ rates: { ...current.rates, [field]: value } }));
  };

  const editCounts = (field: keyof CountsInputs, value: string): void => {
    edit(field, (current) => ({ counts: { ...current.counts, [field]: value } }));
  };

  const editRatio = (field: FieldName, patch: Partial<RatioInputs>): void => {
    edit(field, (current) => ({ ratio: { ...current.ratio, ...patch } }));
  };

  const selectMode = (nextMode: CalculatorMode): void => {
    if (nextMode === mode) return;
    setErrors({});
    actions.setNumbers((n) => ({
      mode: nextMode,
      result: null,
      warnings: [],
      // The provenance only holds for the mode the candidate belongs to.
      sourceCandidate:
        n.sourceCandidate !== null && modeForCandidate(n.sourceCandidate) === nextMode
          ? n.sourceCandidate
          : null,
    }));
  };

  const useCandidate = (candidate: NumberCandidate): void => {
    const current = live().inputs;
    actions.setNumbers({ sourceCandidate: candidate });
    switch (candidate.kind) {
      case 'percent-pair':
        commit('rates', { ...current, rates: ratesFor(candidate, DEFAULT_CONTROL_SIDE) });
        return;
      case 'fraction-pair':
        commit('counts', { ...current, counts: countsFor(candidate, DEFAULT_CONTROL_SIDE) });
        return;
      case 'ratio': {
        const ratio = ratioFor(candidate, current.ratio);
        if (ratio.acrPercent.trim().length === 0) {
          // Loaded, not calculated: the absolute effect needs a baseline risk
          // that the abstract does not supply.
          setErrors({});
          actions.setNumbers({
            mode: 'ratio',
            inputs: { ...current, ratio },
            result: null,
            warnings: [],
          });
          setAcrFocusToken((token) => token + 1);
          return;
        }
        commit('ratio', { ...current, ratio });
        return;
      }
    }
  };

  const chooseControlSide = (side: ControlSide): void => {
    const candidate = live().sourceCandidate;
    const current = live().inputs;
    if (candidate === null) return;
    if (candidate.kind === 'percent-pair') {
      commit('rates', { ...current, rates: ratesFor(candidate, side) });
      return;
    }
    if (candidate.kind === 'fraction-pair') {
      commit('counts', { ...current, counts: countsFor(candidate, side) });
    }
  };

  /** Manual entry's version of the same question: exchange whatever is in the fields. */
  const swapGroups = (): void => {
    const state = live();
    const current = state.inputs;
    let nextInputs: CalculatorInputs;
    if (state.mode === 'rates') {
      const { cerPercent, eerPercent } = current.rates;
      nextInputs = { ...current, rates: { cerPercent: eerPercent, eerPercent: cerPercent } };
    } else if (state.mode === 'counts') {
      const c = current.counts;
      nextInputs = {
        ...current,
        counts: {
          controlEvents: c.interventionEvents,
          controlTotal: c.interventionTotal,
          interventionEvents: c.controlEvents,
          interventionTotal: c.controlTotal,
        },
      };
    } else {
      return;
    }

    // Recompute only when a result is already on screen: the reader asked to see
    // the flip. Otherwise the swapped values just sit there until Calculate.
    if (state.result !== null) {
      commit(state.mode, nextInputs);
      return;
    }
    setErrors({});
    actions.setNumbers({ inputs: nextInputs, result: null, warnings: [] });
  };

  const clearAll = (): void => {
    setErrors({});
    actions.setNumbers({ ...emptyNumbers(), mode: live().mode });
  };

  const pairCandidate =
    sourceCandidate !== null &&
    (sourceCandidate.kind === 'percent-pair' || sourceCandidate.kind === 'fraction-pair') &&
    modeForCandidate(sourceCandidate) === mode
      ? sourceCandidate
      : null;
  const controlSide = pairCandidate === null ? null : controlSideOf(pairCandidate, inputs);
  const candidatesNote = candidatesCaveat(design);

  return (
    <section class="numbers" aria-labelledby="jch-numbers-title">
      <h2 class="numbers__title" id="jch-numbers-title">
        {m.numbers.title}
      </h2>
      <p class="numbers__lead">{m.numbers.lead}</p>

      <section class="numbers__block" aria-labelledby="jch-numbers-candidates">
        <h3 class="numbers__heading" id="jch-numbers-candidates">
          {m.numbers.detected}
        </h3>
        {/* Shown with or without candidates: typing the same pair by hand is the same mistake. */}
        {candidatesNote === null ? null : (
          <p class="numbers__callout">{localizeCaveat(candidatesNote, m)}</p>
        )}
        {candidates.length === 0 ? (
          <>
            <p class="numbers__empty">{m.numbers.none}</p>
            <p class="numbers__hint">{m.numbers.noneHint}</p>
          </>
        ) : (
          <ul class="numbers__candidates">
            {candidates.map((candidate) => {
              const active = isSameCandidate(sourceCandidate, candidate);
              return (
                <li
                  class={
                    active ? 'numbers__candidate numbers__candidate--active' : 'numbers__candidate'
                  }
                  key={`${candidate.kind}:${candidate.start}:${candidate.end}`}
                >
                  <div class="numbers__candidate-head">
                    <span class="numbers__badge" title={m.numbers.kindTitle[candidate.kind]}>
                      {m.numbers.kindBadge[candidate.kind]}
                    </span>
                    <span class="numbers__raw">{candidate.raw}</span>
                    <button
                      class="button numbers__use"
                      type="button"
                      onClick={() => useCandidate(candidate)}
                      aria-label={m.numbers.useLabel(candidate.raw)}
                    >
                      {m.numbers.use}
                    </button>
                  </div>
                  <p class="numbers__sentence">{truncate(candidate.sentence, SENTENCE_LIMIT)}</p>
                  {active ? <p class="numbers__in-use">{m.numbers.inUse}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form
        class="numbers__calculator"
        onSubmit={(event) => {
          event.preventDefault();
          const state = live();
          commit(state.mode, state.inputs);
        }}
      >
        <h3 class="numbers__heading">{m.numbers.calculator}</h3>

        <div class="numbers__modes" role="group" aria-label={m.numbers.modesLabel}>
          {MODES.map((candidateMode) => (
            <button
              class="numbers__mode"
              type="button"
              key={candidateMode}
              aria-pressed={candidateMode === mode}
              onClick={() => selectMode(candidateMode)}
            >
              {m.numbers.mode[candidateMode]}
            </button>
          ))}
        </div>
        <p class="numbers__hint">{m.numbers.modeHint[mode]}</p>

        {mode === 'rates' ? (
          <div class="numbers__groups">
            <div class="numbers__group numbers__group--control">
              <h4 class="numbers__group-title">{m.numbers.controlGroup}</h4>
              <NumberField
                id="jch-numbers-cer"
                label={m.numbers.cerField}
                suffix="%"
                value={inputs.rates.cerPercent}
                error={errors.cerPercent}
                onValue={(value) => editRates('cerPercent', value)}
              />
            </div>
            <div class="numbers__group numbers__group--intervention">
              <h4 class="numbers__group-title">{m.numbers.interventionGroup}</h4>
              <NumberField
                id="jch-numbers-eer"
                label={m.numbers.eerField}
                suffix="%"
                value={inputs.rates.eerPercent}
                error={errors.eerPercent}
                onValue={(value) => editRates('eerPercent', value)}
              />
            </div>
          </div>
        ) : null}

        {mode === 'counts' ? (
          <div class="numbers__groups">
            <div class="numbers__group numbers__group--control">
              <h4 class="numbers__group-title">{m.numbers.controlGroup}</h4>
              <div class="numbers__row">
                <NumberField
                  id="jch-numbers-control-events"
                  label={m.numbers.events}
                  value={inputs.counts.controlEvents}
                  error={errors.controlEvents}
                  onValue={(value) => editCounts('controlEvents', value)}
                />
                <NumberField
                  id="jch-numbers-control-total"
                  label={m.numbers.participants}
                  value={inputs.counts.controlTotal}
                  error={errors.controlTotal}
                  onValue={(value) => editCounts('controlTotal', value)}
                />
              </div>
            </div>
            <div class="numbers__group numbers__group--intervention">
              <h4 class="numbers__group-title">{m.numbers.interventionGroup}</h4>
              <div class="numbers__row">
                <NumberField
                  id="jch-numbers-intervention-events"
                  label={m.numbers.events}
                  value={inputs.counts.interventionEvents}
                  error={errors.interventionEvents}
                  onValue={(value) => editCounts('interventionEvents', value)}
                />
                <NumberField
                  id="jch-numbers-intervention-total"
                  label={m.numbers.participants}
                  value={inputs.counts.interventionTotal}
                  error={errors.interventionTotal}
                  onValue={(value) => editCounts('interventionTotal', value)}
                />
              </div>
            </div>
          </div>
        ) : null}

        {mode === 'ratio' ? (
          <div class="numbers__group">
            <div class="numbers__row">
              <div class="numbers__field">
                <label class="numbers__label" for="jch-numbers-measure">
                  {m.numbers.measure}
                </label>
                <select
                  class="numbers__select"
                  id="jch-numbers-measure"
                  value={inputs.ratio.measure}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    const measure = RATIO_MEASURES.find((name) => name === value);
                    if (measure === undefined) return;
                    editRatio('estimate', { measure });
                  }}
                >
                  {RATIO_MEASURES.map((measure) => (
                    <option value={measure} key={measure}>
                      {m.numbers.measureLabel[measure]}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                id="jch-numbers-estimate"
                label={m.numbers.estimate}
                placeholder="0.72"
                value={inputs.ratio.estimate}
                error={errors.estimate}
                onValue={(value) => editRatio('estimate', { estimate: value })}
              />
            </div>
            <div class="numbers__row">
              <NumberField
                id="jch-numbers-ci-low"
                label={m.numbers.ciLow}
                placeholder="0.61"
                value={inputs.ratio.ciLow}
                error={errors.ciLow}
                onValue={(value) => editRatio('ciLow', { ciLow: value })}
              />
              <NumberField
                id="jch-numbers-ci-high"
                label={m.numbers.ciHigh}
                placeholder="0.85"
                value={inputs.ratio.ciHigh}
                error={errors.ciHigh}
                onValue={(value) => editRatio('ciHigh', { ciHigh: value })}
              />
            </div>
            <NumberField
              id="jch-numbers-acr"
              label={m.numbers.acr}
              suffix="%"
              inputRef={acrRef}
              hint={m.numbers.acrHint}
              value={inputs.ratio.acrPercent}
              error={errors.acrPercent}
              onValue={(value) => editRatio('acrPercent', { acrPercent: value })}
            />
          </div>
        ) : null}

        {mode !== 'ratio' ? (
          <fieldset class="numbers__assign">
            <legend class="numbers__assign-legend">{m.numbers.whichControl}</legend>
            {pairCandidate !== null ? (
              <>
                {(['first', 'second'] as const).map((side) => (
                  <label class="numbers__choice" key={side}>
                    <input
                      type="radio"
                      name="jch-numbers-control-side"
                      checked={controlSide === side}
                      onChange={() => chooseControlSide(side)}
                    />
                    <span class="numbers__choice-text">
                      <span class="numbers__choice-value">{armText(pairCandidate, side)}</span>
                      {side === 'first' ? m.numbers.firstInSentence : m.numbers.secondInSentence}
                    </span>
                  </label>
                ))}
                {controlSide === null ? (
                  <p class="numbers__hint">{m.numbers.noLongerMatch}</p>
                ) : null}
              </>
            ) : (
              <div class="numbers__assign-manual">
                <p class="numbers__hint">{m.numbers.manualControl}</p>
                <button class="button" type="button" onClick={swapGroups}>
                  {m.numbers.swap}
                </button>
              </div>
            )}
            <p class="numbers__hint">{m.numbers.yourCall}</p>
          </fieldset>
        ) : null}

        {errors.form ? (
          <p class="numbers__error" role="alert">
            {errors.form}
          </p>
        ) : null}

        <div class="numbers__actions">
          <button class="button numbers__submit" type="submit">
            {m.numbers.calculate}
          </button>
          <button class="button" type="button" onClick={clearAll}>
            {m.numbers.clear}
          </button>
        </div>
      </form>

      <div class="numbers__output" aria-live="polite">
        {result === null ? (
          <p class="numbers__hint">{m.numbers.noResult}</p>
        ) : (
          <ResultPanel
            mode={mode}
            result={result}
            warnings={warnings}
            caveat={resultCaveat(design, mode)}
          />
        )}
      </div>

      <HowThisIsCalculated />
    </section>
  );
}
