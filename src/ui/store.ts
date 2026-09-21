/**
 * Side panel state container (issue #6 support).
 *
 * Hand-rolled on purpose: spec §5 allows no state library. Every tab reads and
 * writes through the actions below, so tab components stay independent of each
 * other and of how the state is persisted (issue #18 autosaves `toAppraisal()`).
 */
import { useEffect, useState } from 'preact/hooks';
import type {
  Appraisal,
  DesignClassification,
  ItemAnswer,
  NumbersState,
  Pico,
  PicoField,
  PubMedArticle,
  SourceScope,
  StudyDesign,
  ValidityAnswers,
  Verdict,
} from '../lib/types';

export type ArticleStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';

export type TabId = 'pico' | 'numbers' | 'validity' | 'export';

export interface AppState {
  status: ArticleStatus;
  article: PubMedArticle | null;
  /** Message shown when status is 'error'. */
  error: string | null;
  activeTab: TabId;
  classification: DesignClassification | null;
  designOverride: StudyDesign | null;
  subtypeOverride: string | null;
  pico: Pico;
  numbers: NumbersState;
  validity: ValidityAnswers;
  /** What the reader has in front of them; the default for every item. */
  sourceScope: SourceScope;
  /** Funding and conflicts: recorded, never scored. */
  info: Record<string, string>;
  bottomLine: string;
  /** True once a saved appraisal for the bound PMID has been restored (issue #18). */
  hydrated: boolean;
  /** Set when autosave refuses a write, e.g. the 64 KB per-appraisal cap. */
  saveError: string | null;
}

export const emptyPico = (): Pico => ({ p: '', i: '', c: '', o: '' });

export const emptyNumbers = (): NumbersState => ({
  mode: 'counts',
  inputs: {
    rates: { cerPercent: '', eerPercent: '' },
    counts: { controlEvents: '', controlTotal: '', interventionEvents: '', interventionTotal: '' },
    ratio: { measure: 'RR', estimate: '', ciLow: '', ciHigh: '', acrPercent: '' },
  },
  result: null,
  warnings: [],
  sourceCandidate: null,
});

export const initialState = (): AppState => ({
  status: 'idle',
  article: null,
  error: null,
  activeTab: 'pico',
  classification: null,
  designOverride: null,
  subtypeOverride: null,
  pico: emptyPico(),
  numbers: emptyNumbers(),
  validity: {},
  // Most appraisals start from a PubMed abstract, so that is the honest default.
  sourceScope: 'abstract',
  info: {},
  bottomLine: '',
  hydrated: false,
  saveError: null,
});

type Listener = () => void;

class Store {
  private state: AppState = initialState();
  private listeners = new Set<Listener>();

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Called when the panel binds to a different PMID; tab answers must not leak across articles. */
  resetForArticle(article: PubMedArticle | null): void {
    this.state = { ...initialState(), activeTab: this.state.activeTab, article };
    for (const listener of this.listeners) listener();
  }
}

export const store = new Store();

/** Subscribe to a slice. The selector result is compared with Object.is. */
export function useStore<T>(select: (s: AppState) => T): T {
  const [value, setValue] = useState(() => select(store.get()));
  useEffect(() => {
    const read = () => {
      const next = select(store.get());
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    };
    read();
    return store.subscribe(read);
    // The selector is expected to be stable for the component's lifetime,
    // so it is deliberately not part of the dependency array.
  }, []);
  return value;
}

/* ------------------------------------------------------------------- actions */

export const actions = {
  setStatus(status: ArticleStatus, error: string | null = null) {
    store.set({ status, error });
  },

  setActiveTab(activeTab: TabId) {
    store.set({ activeTab });
  },

  setArticle(article: PubMedArticle | null) {
    store.resetForArticle(article);
  },

  setClassification(classification: DesignClassification | null) {
    store.set({ classification });
  },

  setDesignOverride(designOverride: StudyDesign | null) {
    // A subtype belongs to the design it was detected on, so changing the design
    // must not leave "non-inferiority" attached to, say, a cohort study.
    store.set({ designOverride, subtypeOverride: null });
  },

  setSubtypeOverride(subtypeOverride: string | null) {
    store.set({ subtypeOverride });
  },

  setPicoField(field: PicoField, text: string) {
    const key = field.toLowerCase() as keyof Pico;
    store.set((s) => ({ pico: { ...s.pico, [key]: text } }));
  },

  /** Click-to-fill from a highlighted candidate: replace when empty, otherwise append. */
  appendPicoField(field: PicoField, text: string) {
    const key = field.toLowerCase() as keyof Pico;
    store.set((s) => {
      const current = s.pico[key].trim();
      const next = current.length === 0 ? text : `${current} ${text}`;
      return { pico: { ...s.pico, [key]: next } };
    });
  },

  setNumbers(patch: Partial<NumbersState> | ((n: NumbersState) => Partial<NumbersState>)) {
    store.set((s) => ({
      numbers: { ...s.numbers, ...(typeof patch === 'function' ? patch(s.numbers) : patch) },
    }));
  },

  setSourceScope(sourceScope: SourceScope) {
    store.set({ sourceScope });
  },

  setInfoField(fieldId: string, value: string) {
    store.set((s) => ({ info: { ...s.info, [fieldId]: value } }));
  },

  setValidityAnswer(checklistId: string, itemId: string, answer: Partial<ItemAnswer>) {
    store.set((s) => {
      const forChecklist = s.validity[checklistId] ?? {};
      const current: ItemAnswer = forChecklist[itemId] ?? {
        verdict: null,
        note: '',
        source: null,
      };
      return {
        validity: {
          ...s.validity,
          [checklistId]: { ...forChecklist, [itemId]: { ...current, ...answer } },
        },
      };
    });
  },

  setVerdict(checklistId: string, itemId: string, verdict: Verdict | null) {
    actions.setValidityAnswer(checklistId, itemId, { verdict });
  },

  setBottomLine(bottomLine: string) {
    store.set({ bottomLine });
  },

  setSaveError(saveError: string | null) {
    store.set({ saveError });
  },

  /** Restore a saved appraisal onto the currently bound article (issue #18). */
  hydrateFrom(appraisal: Appraisal | null) {
    if (!appraisal) {
      store.set({ hydrated: true });
      return;
    }
    store.set({
      classification: appraisal.designDetected ?? store.get().classification,
      designOverride: appraisal.designOverride,
      subtypeOverride: appraisal.subtypeOverride,
      pico: appraisal.pico,
      numbers: appraisal.numbers ?? emptyNumbers(),
      validity: appraisal.validity,
      sourceScope: appraisal.sourceScope,
      info: appraisal.info,
      bottomLine: appraisal.bottomLine,
      hydrated: true,
    });
  },
};

/** The subtype the conditional checklist groups key off; override wins over detection. */
export function effectiveSubtype(s: AppState): string | null {
  if (s.subtypeOverride !== null) return s.subtypeOverride;
  // A detected subtype only applies while the detected design is still in force.
  if (s.designOverride !== null) return null;
  return s.classification?.subtype ?? null;
}

/** The design the checklist and the export use: manual override wins over detection. */
export function effectiveDesign(s: AppState): StudyDesign {
  return s.designOverride ?? s.classification?.design ?? 'unclear';
}

/** Snapshot of the current panel state as a persistable appraisal (issue #18). */
export function toAppraisal(s: AppState, createdAt: number): Appraisal | null {
  if (!s.article) return null;
  const { title, authors, journal, year, doi } = s.article;
  return {
    schemaVersion: 2,
    pmid: s.article.pmid,
    createdAt,
    updatedAt: Date.now(),
    citation: { title, authors, journal, year, doi },
    designDetected: s.classification,
    designOverride: s.designOverride,
    subtypeOverride: s.subtypeOverride,
    pico: s.pico,
    numbers: s.numbers.result || s.numbers.sourceCandidate ? s.numbers : null,
    validity: s.validity,
    sourceScope: s.sourceScope,
    info: s.info,
    bottomLine: s.bottomLine,
    discussionQuestions: [],
  };
}
