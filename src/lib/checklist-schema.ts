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
import type {
  Checklist,
  ChecklistGroup,
  ChecklistItem,
  ChecklistSection,
  EvidenceNeed,
  InfoPanel,
  ItemAnswer,
  SourceScope,
  StudyDesign,
  VerdictHelp,
} from './types';

import caseControlJson from '../data/checklists/case-control.json';
import cohortJson from '../data/checklists/cohort.json';
import crossSectionalJson from '../data/checklists/cross-sectional.json';
import diagnosticJson from '../data/checklists/diagnostic.json';
import rctJson from '../data/checklists/rct.json';
import srMaJson from '../data/checklists/sr-ma.json';
import unclearJson from '../data/checklists/unclear.json';
import verdictsJson from '../data/verdict-help/verdicts.json';

export type {
  Checklist,
  ChecklistGroup,
  ChecklistItem,
  ChecklistSection,
  EvidenceNeed,
  InfoField,
  InfoPanel,
  ItemAnswer,
  SourceScope,
  Verdict,
  VerdictHelp,
} from './types';

/**
 * Shape TypeScript infers for a checklist JSON module: `id` is a plain string
 * there, so it is narrowed to `StudyDesign` once, here, rather than with a cast
 * at every use site.
 *
 * The same applies to every union field. `resolveJsonModule` widens each JSON
 * string to `string`, so an imported file can never satisfy `section:
 * ChecklistSection` or `needs: EvidenceNeed` no matter how correct its content
 * is. The raw shape keeps them as strings and narrows on the way out.
 *
 * `tests/lib/checklist-schema.test.ts` is what actually proves the files match:
 * it checks `section`, `needs` and `lookFor` on every item of every checklist,
 * group items included. Without that test these casts would be a hole.
 */
type RawItem = Omit<ChecklistItem, 'section' | 'needs'> & { section: string; needs: string };
type RawGroup = Omit<ChecklistGroup, 'items'> & { items: RawItem[] };

interface RawChecklist {
  id: string;
  title: string;
  version: number;
  note?: string;
  items: RawItem[];
  groups?: RawGroup[];
  info?: InfoPanel;
}

// One narrowing cast per union field rather than one over the whole object, so
// the rest of the shape is still checked by the compiler.
function toItem(raw: RawItem): ChecklistItem {
  return { ...raw, section: raw.section as ChecklistSection, needs: raw.needs as EvidenceNeed };
}

function toGroup(raw: RawGroup): ChecklistGroup {
  return { ...raw, items: raw.items.map(toItem) };
}

function toChecklist(raw: RawChecklist): Checklist {
  // groups and items are pulled out of the spread so the raw shapes cannot leak
  // back in through it.
  const { groups: rawGroups, items: rawItems, ...rest } = raw;
  const groups = rawGroups?.map(toGroup);
  return {
    ...rest,
    id: raw.id as StudyDesign,
    items: rawItems.map(toItem),
    ...(groups === undefined ? {} : { groups }),
  };
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

/**
 * The checklist to show for a design, with the subtype-specific groups that
 * apply kept and the rest dropped.
 *
 * Passing the subtype is what adds the non-inferiority checks to a
 * non-inferiority trial. They are *added* to the general items, never a
 * replacement: a non-inferiority trial still has to survive randomisation,
 * concealment and missing data like any other.
 */
export function getChecklist(design: StudyDesign, subtype?: string | null): Checklist {
  const found: Checklist | undefined = BY_DESIGN[design];
  const checklist = found ?? unclear;
  const groups = applicableGroups(checklist, subtype ?? null);
  if (groups.length === (checklist.groups?.length ?? 0)) return checklist;
  return groups.length === 0 ? withoutGroups(checklist) : { ...checklist, groups };
}

function withoutGroups(checklist: Checklist): Checklist {
  const { groups: _groups, ...rest } = checklist;
  return rest;
}

/** The subtype-specific groups that apply to a classification. */
export function applicableGroups(checklist: Checklist, subtype: string | null): ChecklistGroup[] {
  if (subtype === null) return [];
  return (checklist.groups ?? []).filter((group) => group.subtypes.includes(subtype));
}

/** Every item a reader will actually see, general items first then each group's. */
export function visibleItems(checklist: Checklist): ChecklistItem[] {
  return [...checklist.items, ...(checklist.groups ?? []).flatMap((group) => group.items)];
}

/** Items in one section, in file order. */
export function itemsInSection(checklist: Checklist, section: ChecklistSection): ChecklistItem[] {
  return checklist.items.filter((item) => item.section === section);
}

/** An empty answer. `source: null` means "whatever the appraisal is scoped to". */
export function emptyAnswer(): ItemAnswer {
  return { verdict: null, note: '', source: null };
}

/**
 * True when the reader cannot reasonably settle this question from what they
 * have. The UI uses it to explain an Unclear rather than to imply a flaw.
 */
export function needsMoreThan(item: ChecklistItem, scope: SourceScope): boolean {
  const rank: Record<SourceScope, number> = {
    abstract: 0,
    other: 0,
    'full-text': 1,
    supplement: 1,
    protocol: 2,
    registry: 2,
  };
  const required: Record<EvidenceNeed, number> = {
    abstract: 0,
    'full-text': 1,
    'protocol-or-registry': 2,
  };
  return rank[scope] < required[item.needs];
}

/** Every distinct checklist, in display order. The array is a copy; the checklists are shared. */
export function allChecklists(): Checklist[] {
  return [...ALL];
}

/** Shared copy explaining what Yes / No / Unclear mean (spec §4.4, `src/data/verdict-help/`). */
export const VERDICT_HELP: VerdictHelp = verdictsJson;
