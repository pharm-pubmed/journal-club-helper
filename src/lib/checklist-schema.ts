/**
 * Validity checklist loader (issue #13).
 *
 * The item wording lives in JSON under `src/data/checklists/` so it can be
 * corrected without touching code (spec §4.4). The files are imported
 * statically, so they are bundled into the extension: no runtime fetch, no
 * async loading path for the side panel to wait on, and no host permission.
 *
 * Nothing here touches `chrome.*` or the DOM.
 */
import type { Checklist, ChecklistItem, StudyDesign, VerdictHelp } from './types';

import caseControlJson from '../data/checklists/case-control.json';
import cohortJson from '../data/checklists/cohort.json';
import crossSectionalJson from '../data/checklists/cross-sectional.json';
import diagnosticJson from '../data/checklists/diagnostic.json';
import rctJson from '../data/checklists/rct.json';
import srMaJson from '../data/checklists/sr-ma.json';
import unclearJson from '../data/checklists/unclear.json';
import verdictsJson from '../data/verdict-help/verdicts.json';

export type { Checklist, ChecklistItem, Verdict, ItemAnswer, VerdictHelp } from './types';

/**
 * Shape TypeScript infers for a checklist JSON module: `id` is a plain string
 * there, so it is narrowed to `StudyDesign` once, here, rather than with a cast
 * at every use site. The structural validation test is what actually proves the
 * files match this shape.
 */
interface RawChecklist {
  id: string;
  title: string;
  version: number;
  note?: string;
  items: ChecklistItem[];
}

function toChecklist(raw: RawChecklist): Checklist {
  return { ...raw, id: raw.id as StudyDesign };
}

const rct = toChecklist(rctJson);
const cohort = toChecklist(cohortJson);
const caseControl = toChecklist(caseControlJson);
const crossSectional = toChecklist(crossSectionalJson);
const srMa = toChecklist(srMaJson);
const diagnostic = toChecklist(diagnosticJson);
const unclear = toChecklist(unclearJson);

/** Display order in the UI: the specific designs first, the generic one last. */
const ALL: readonly Checklist[] = [
  rct,
  cohort,
  caseControl,
  crossSectional,
  srMa,
  diagnostic,
  unclear,
];

/**
 * Keyed by string rather than by `StudyDesign` so a design string restored from
 * an older stored appraisal cannot index into the record unchecked.
 *
 * `non-randomized-trial` deliberately resolves to the RCT checklist (issue #1,
 * decision B5): design detection can produce that design, but the same items
 * apply — see the checklist-level note on rct.json.
 */
const BY_DESIGN: Readonly<Record<string, Checklist>> = {
  rct,
  'non-randomized-trial': rct,
  cohort,
  'case-control': caseControl,
  'cross-sectional': crossSectional,
  'sr-ma': srMa,
  diagnostic,
  unclear,
};

/** The checklist to show for a design. Unknown designs fall back to the generic one. */
export function getChecklist(design: StudyDesign): Checklist {
  const found: Checklist | undefined = BY_DESIGN[design];
  return found ?? unclear;
}

/** Every distinct checklist, in display order. The array is a copy; the checklists are shared. */
export function allChecklists(): Checklist[] {
  return [...ALL];
}

/** Shared copy explaining what Yes / No / Unclear mean (spec §4.4, `src/data/verdict-help/`). */
export const VERDICT_HELP: VerdictHelp = verdictsJson;
