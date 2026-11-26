/**
 * English messages (#82). The source of truth: `ja.ts` is typed against this
 * object, so a message added here and not translated fails the type check.
 *
 * A message that needs a value is a function. Plurals are decided inside the
 * function, because Japanese has none and English needs them.
 */

import type {
  ChecklistSection,
  DesignConfidence,
  DesignEvidence,
  EvidenceNeed,
  PicoField,
  SourceScope,
  StudyDesign,
  Verdict,
} from '../lib/types';

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function unreadablePhrase(count: number): string {
  return plural(count, 'record this version could not read', 'records this version could not read');
}

/** "3 saved appraisals", "… and 2 records this version could not read", or only the second half. */
function recordsPhrase(readable: number, unreadable: number, one: string, many: string): string {
  const hidden = unreadablePhrase(unreadable);
  if (unreadable === 0) return plural(readable, one, many);
  if (readable === 0) return hidden;
  return `${plural(readable, one, many)} and ${hidden}`;
}

export const en = {
  common: {
    productName: 'Journal Club Helper',
  },

  app: {
    footer: 'Educational appraisal aid — not clinical advice.',
    settings: 'Settings',
  },

  tabs: {
    listLabel: 'Appraisal sections',
    pico: 'PICO',
    numbers: 'Numbers',
    // The id stays `validity` because stored appraisals key off it; the label
    // follows the section it now contains.
    validity: 'Appraisal',
    export: 'Export',
  },

  header: {
    etAl: 'et al.',
    viaEutils: 'via NCBI E-utilities',
    pmid: (pmid: string) => `PMID ${pmid}`,
  },

  empty: {
    noArticle: 'Open a PubMed abstract page to start',
    noArticleHint:
      'The panel reads the abstract of a single record — a pubmed.ncbi.nlm.nih.gov address ending in a PMID. Search results and other sites are not read.',
    unreadableTitle: 'The abstract on this page could not be read',
    unreadableHint: (pmid: string | null) =>
      'The record may have no abstract (letters and editorials often do not), or PubMed may have ' +
      'changed its layout. The same record can be fetched from NCBI’s E-utilities service instead. ' +
      `Only the PMID${pmid ? ` (${pmid})` : ''} and this extension’s name are sent. Your browser ` +
      'asks for permission the first time.',
    fetching: (pmid: string) => `Fetching PMID ${pmid} from NCBI…`,
    fetchFromNcbi: 'Fetch from NCBI',
    readAgain: 'Read the page again',
    errorTitle: 'The panel could not read this page',
    retry: 'Retry',
    nothingToAppraise: 'Nothing to appraise on this page',
    looking: 'Looking for a PubMed abstract…',
  },

  labels: {
    design: {
      rct: 'Randomized controlled trial',
      'non-randomized-trial': 'Non-randomized trial',
      cohort: 'Cohort study',
      'case-control': 'Case-control study',
      'cross-sectional': 'Cross-sectional study',
      'sr-ma': 'Systematic review / meta-analysis',
      diagnostic: 'Diagnostic accuracy study',
      unclear: 'Not detected',
    } satisfies Record<StudyDesign, string>,
    /** "Not detected" describes the classifier; as a choice it reads wrong. */
    designUnclearOption: 'Unclear / other',
    subtype: {
      parallel: 'parallel',
      crossover: 'crossover',
      cluster: 'cluster',
      'non-inferiority': 'non-inferiority',
      'systematic-review': 'systematic review',
      'meta-analysis': 'meta-analysis',
      'network-meta-analysis': 'network meta-analysis',
    } as Record<string, string>,
    subtypeLine: {
      'non-inferiority': 'Non-inferiority design',
      equivalence: 'Equivalence design',
      crossover: 'Crossover design',
      cluster: 'Cluster-randomised design',
      parallel: 'Parallel-group design',
      'systematic-review': 'Systematic review',
      'meta-analysis': 'Meta-analysis',
      'network-meta-analysis': 'Network meta-analysis',
    } as Record<string, string>,
    subtypeLineFallback: (subtype: string) =>
      `${subtype.charAt(0).toUpperCase()}${subtype.slice(1)} design`,
    designWithSubtype: (design: string, subtype: string) => `${design} (${subtype})`,
    confidence: {
      high: 'Detected from publication type',
      medium: 'Detected from abstract keywords',
      low: 'Not detected',
    } satisfies Record<DesignConfidence, string>,
    evidenceKind: {
      'publication-type': 'publication type',
      keyword: 'abstract keyword',
    } satisfies Record<DesignEvidence['kind'], string>,
    section: {
      'internal-validity': 'Internal validity',
      applicability: 'Applicability',
    } satisfies Record<ChecklistSection, string>,
    sourceScope: {
      abstract: 'Abstract only',
      'full-text': 'Full text',
      supplement: 'Supplement',
      protocol: 'Protocol',
      registry: 'Trial registry',
      other: 'Other source',
    } satisfies Record<SourceScope, string>,
    evidenceNeed: {
      abstract: 'Usually answerable from the abstract.',
      'full-text': 'Usually needs the full text — an abstract rarely has this detail.',
      'protocol-or-registry':
        'Usually needs the protocol, the statistical analysis plan or the trial registry.',
    } satisfies Record<EvidenceNeed, string>,
    verdict: { yes: 'Yes', no: 'No', unclear: 'Unclear' } satisfies Record<Verdict, string>,
    pico: {
      P: 'Population',
      I: 'Intervention',
      C: 'Comparison',
      O: 'Outcome',
    } satisfies Record<PicoField, string>,
  },

  design: {
    key: 'Study design:',
    setManually: 'Set manually',
    noSubtype: 'No subtype',
    evidence: (count: number) => `Evidence (${count})`,
    design: 'Design',
    subtype: 'Subtype',
    reset: 'Reset to detected',
    notDetectedHint:
      'Nothing in the publication types or the abstract wording matched a study design. Choose one below so the checklist and the export match this article.',
    suggested: (what: string) => `Detection suggested ${what}.`,
    foundNoSubtype: 'Detection found no subtype.',
  },

  pico: {
    title: 'Clinical question',
    intro:
      'Write the question in your own words. The highlights below are phrases matched by simple cue words — suggestions, not extraction. They miss a great deal, so selecting text yourself is the main way to fill these in.',
    placeholder: {
      P: 'e.g. adults admitted with pneumonia',
      I: 'e.g. 5 days of oral amoxicillin',
      C: 'e.g. placebo, or 10 days of the same drug',
      O: 'e.g. death within 30 days',
    } satisfies Record<PicoField, string>,
    clear: 'Clear',
    clearField: (field: string) => `Clear ${field}`,
    markTitle: (field: string, reason: string, also: string[]) => {
      const cue =
        reason === 'numeric result'
          ? 'it reports a number in the results'
          : `the abstract says “${reason}”`;
      const tail = also.length > 0 ? ` The same words also matched ${also.join(' and ')}.` : '';
      return `Suggested for ${field} because ${cue}.${tail}`;
    },
    markLabel: (text: string, field: string) => `Add “${text}” to ${field}`,
    added: (field: string) => `Added to ${field}.`,
    alsoAddTo: 'Also add to',
    addSelectionTo: 'Add the selection to',
    abstract: 'Abstract',
    showCandidates: 'Show candidates',
    viewerNote: 'A copy of the abstract. The PubMed page itself is never changed.',
    helpSummary: 'How to pull text into a field',
    help: [
      'Click a highlighted phrase to add it to its field.',
      'Select any text in the abstract to choose a field for it.',
      'Keyboard: Tab to a highlight and press Enter. To select free text, turn on caret browsing (F7), select with Shift and the arrow keys, then press Enter.',
      'Adding to a field that already has text appends to it; nothing is overwritten.',
    ],
    fromTitle: 'From the title',
    addTitleTo: (field: string) => `Add the title to ${field}`,
    abstractText: 'Abstract text',
    chooserLabel: 'Send this phrase to a PICO field',
    addTo: (field: string) => `Add to ${field}`,
    close: 'Close',
    noAbstract:
      'This page has no abstract text, so there is nothing to highlight. The four fields above still work.',
  },

  validity: {
    title: 'Critical appraisal',
    sectionLede: {
      'internal-validity':
        'How far the study can answer its own question. Judge the methods. Where your source does not say, that is a limit on what you can check, not a fault you have found.',
      applicability:
        'A different question from the ones above: whether an answer this study supports would transfer to your patient. A study can be sound here and still not apply, or apply and still be shaky.',
    } satisfies Record<ChecklistSection, string>,
    unanswered: 'Unanswered',
    clear: 'Clear',
    clearAnswer: (item: string) => `Clear the answer for ${item}`,
    readIn: 'Read in',
    inherited: (scope: string) => `${scope} — appraisal default`,
    lookFor: 'What to look for',
    why: 'Why it matters',
    note: 'Note',
    addNote: 'Add a note',
    noteFor: (item: string) => `Note for ${item}`,
    notePlaceholder: 'What you would raise about this point',
    extraChecks: 'Extra checks, added to the list above',
    recordedNotScored: 'Recorded, not scored',
    answered: (answered: number, total: number) => `${answered} of ${total} answered`,
    tally: (count: number, verdict: string) => `${count} ${verdict}`,
    scopeTitle: 'What are you working from?',
    scopeHint:
      'Saved with the appraisal and used as the default for every item, so a reader of the export knows what these judgements were based on.',
    lede: 'Unclear means the source in front of you does not say. It is an honest answer about your evidence, not a mark against the study.',
    helpSummary: 'What Yes, No and Unclear mean',
    designNotDetected:
      'Study design was not detected. Pick one in the header or use this generic checklist.',
  },

  export: {
    title: 'One-page summary',
    noArticle: 'No PubMed article is bound to this panel, so there is nothing to export yet.',
    bottomLine: 'Bottom line — in your own words',
    bottomLineHint: (product: string) =>
      `One or two sentences: what you think this paper shows, and how much weight you would put on it. ${product} never writes this for you — it is copied into the summary exactly as you type it, and left blank if you leave it blank.`,
    bottomLinePlaceholder:
      'e.g. Large absolute benefit, but the trial was stopped early and outcome assessment was not blinded, so I would read the full text before trusting the size of the effect.',
    copyMarkdown: 'Copy Markdown',
    copyText: 'Copy plain text',
    download: 'Download .md',
    copied: {
      markdown: 'Markdown copied to the clipboard.',
      text: 'Plain text copied to the clipboard.',
    },
    saved: (filename: string) => `${filename} saved to your downloads folder.`,
    copyBlocked: (reason: string | null) =>
      `This browser blocked the copy${reason === null ? '' : ` (${reason})`}.`,
    noClipboard: 'This browser gives the panel no clipboard access.',
    clipboardFallback:
      'You can still select the text in the preview below and copy it yourself (Ctrl+C, or Cmd+C on a Mac), or use Download .md.',
    buildFailed: (reason: string | null) =>
      `Could not build the file${reason === null ? '' : ` (${reason})`}. You can copy the preview below instead.`,
    preview: 'Preview — exactly what the buttons copy',
    wrap: 'Wrap long lines',
  },

  errors: {
    readFailed: 'The panel could not read the page.',
    notGranted: 'NCBI was not contacted, because the permission was not granted. Nothing was sent.',
    noPermissionsApi:
      'This browser cannot grant the permission the NCBI fetch needs. Nothing was sent.',
    ncbi: {
      notPmid: (pmid: string) => `"${pmid}" is not a PMID.`,
      timeout: 'NCBI did not answer in time. Try again in a moment.',
      network: (cause: string) => `Could not reach NCBI: ${cause}`,
      cutOff: (cause: string) => `The answer from NCBI was cut off: ${cause}`,
      rateLimit: 'NCBI asked us to slow down. Try again in a few seconds.',
      http: (status: number) => `NCBI answered with HTTP ${status}.`,
      notXml: 'NCBI sent something that is not XML.',
      book: (pmid: string) =>
        `PubMed record ${pmid} is a book or book chapter, which the panel cannot appraise.`,
      notFound: (pmid: string) => `NCBI has no PubMed record ${pmid}.`,
      noAbstract: (pmid: string) => `PubMed record ${pmid} has no abstract.`,
    },
    storage: {
      notPreserved:
        'The saved appraisal could not be preserved safely. It has not been replaced. Free storage space or recover the existing record before trying again.',
      noPmid: 'This article has no usable PubMed ID, so it cannot be saved.',
      tooLarge: (kb: number, limitKb: number) =>
        `This appraisal is too large to save (${kb} KB; the limit is ${limitKb} KB per article). Shorten your notes and try again.`,
      notJson: 'That file is not valid JSON. Choose a file exported by this extension.',
      notExport: 'That file is not a Journal Club Helper export.',
      olderVersion:
        'That backup was written by an earlier version of this extension, before the appraisal checklists changed, and cannot be read. Nothing here has been altered.',
      otherVersion:
        'That export was written by a different version of this extension and cannot be read. Nothing here has been altered.',
      noList: 'That file has no valid appraisal list. Nothing here has been changed.',
      nothingToImport:
        'That file contains no appraisals and no readable usage counts to restore. Nothing here has been changed.',
      noneReadable:
        'None of the appraisals in that file could be read, so nothing was imported and nothing here has been changed.',
      importStopped: (imported: number, skipped: number, cause: string) =>
        `Import stopped: ${imported} appraisal(s) were written and ${skipped} skipped. Any earlier writes or removals were not rolled back. ${cause}`,
      storageFailed: 'Browser storage could not be updated.',
    },
  },

  pageButton: {
    label: 'Journal Club',
    title: 'Open the critical appraisal panel',
    stale: 'Reload the page',
    staleTitle: 'The extension was updated. Reload this page to use the panel.',
  },

  action: {
    active: 'Open Journal Club Helper',
    idle: 'Journal Club Helper — open a PubMed abstract page to use it',
  },

  options: {
    documentTitle: 'Journal Club Helper — Options',
    tagline:
      'Settings and saved data. Everything on this page is stored in this browser, on this device.',

    languageHeading: 'Language',
    languageNote:
      'The panel, the checklists and the exported summary use this language. Text you typed stays as you typed it, and the PubMed record stays as published.',
    languageLegend: 'Display language',
    languageAuto: (shown: string) => `Same as the browser (showing ${shown} now)`,
    // Each language is named in itself, as language pickers usually do.
    languageEnglish: 'English',
    languageJapanese: '日本語',
    languageNames: { en: 'English', ja: 'Japanese' },
    languageSaveError: 'Could not save the language setting.',

    dataHeading: 'Your data',
    loadError: 'Could not read your saved data from this browser.',
    reading: 'Reading your saved appraisals…',
    countLabel: (count: number, max: number) =>
      `${count === 1 ? 'appraisal saved' : 'appraisals saved'} of ${max.toLocaleString()}`,
    nothingSaved:
      'Nothing saved yet. Open a PubMed abstract and start an appraisal in the side panel — it is saved here automatically.',
    alsoStored: (unreadable: number) =>
      `Also stored here: ${unreadablePhrase(unreadable)}. They are kept rather than overwritten, but not listed or exported. Delete all removes them too.`,
    nearCap: (max: number) =>
      `You are close to the limit. Past ${max.toLocaleString()}, the appraisal you edited least recently is removed to make room for a new one. Export a backup if you want to keep the older ones.`,
    mostRecent: 'Most recent',
    listMeta: (pmid: string, date: string) => `PMID ${pmid} · edited ${date}`,
    unknownDate: 'an unknown date',
    andMore: (count: number) => `…and ${plural(count, 'more', 'more')}.`,

    exportHeading: 'Export',
    exportNote:
      'Writes every appraisal and your usage counts to one JSON file in your downloads folder. Nothing is uploaded: the file is built in this page and handed straight to the browser.',
    exportAll: 'Export all',
    exported: (count: number) =>
      `Saved ${plural(count, 'appraisal', 'appraisals')} to your downloads folder.`,
    exportError: 'Could not build the backup file.',

    importHeading: 'Import',
    importNote: 'Choose what should happen to what is already saved here.',
    importLegend: 'When importing a backup',
    mergeTitle: 'Merge (recommended)',
    mergeHint:
      'Keeps what is saved here and adds the appraisals from the file. If both have the same article, the newer version is kept and the older one is skipped.',
    replaceTitle: 'Replace',
    replaceHint:
      'Deletes every appraisal saved here first, then loads the file. Anything saved here that is not in the file is gone. A backup containing only usage counts keeps all existing appraisals.',
    countsNote:
      'Merging keeps the higher of the two usage counts below; replacing takes the counts from the file.',
    chooseFile: 'Choose a backup file…',
    countsRestored: 'Restored usage counts. Existing appraisals were kept.',
    importSummary: (imported: number, skipped: number, mode: 'merge' | 'replace') => {
      const head =
        mode === 'replace'
          ? `Replaced everything stored here with ${plural(imported, 'appraisal', 'appraisals')} from the file.`
          : `Imported ${plural(imported, 'appraisal', 'appraisals')}.`;
      if (skipped === 0) return head;
      const why =
        mode === 'replace'
          ? 'they could not be read'
          : 'the copy already saved here is newer, or they could not be read';
      return `${head} Skipped ${skipped.toLocaleString()} (${why}).`;
    },
    importError: 'Could not read that file. Choose a backup exported by this extension.',

    deleteHeading: 'Delete',
    confirmLabel: 'Confirm deleting all appraisals',
    confirmText: (count: number, unreadable: number) =>
      `Delete ${recordsPhrase(count, unreadable, 'saved appraisal', 'saved appraisals')}? They are stored only in this browser, on this device. There is no copy on a server and no account to restore from, so this cannot be undone. Export a backup first if there is any chance you want them back.`,
    cancel: 'Cancel',
    confirmDelete: 'Yes, delete everything',
    deleteNote: 'Removes every saved appraisal from this browser. Your usage counts are kept.',
    deleteAll: 'Delete all appraisals',
    deleted: (deleted: number, unreadable: number) =>
      `Deleted ${recordsPhrase(deleted, unreadable, 'appraisal', 'appraisals')}. The usage counts below were kept.`,
    deleteError: 'Could not delete your appraisals.',

    usageHeading: 'Usage (stored only on this device)',
    usageNote:
      'These numbers never leave your browser. This version contains no analytics and no tracking of any kind, this page makes no network requests at all, and there is no server to send them to — check the Network tab in developer tools if you want to see for yourself. They are counted here only so you can see them, and they disappear when you remove the extension.',
    panelOpens: 'Side panel opened',
    exports: 'Summaries exported',
    aiRuns: 'AI runs',
    aiNote:
      'AI runs stay at 0 in this version: the AI features arrive in a later version and are not part of what you have installed.',

    aboutHeading: 'About',
    version: (version: string | null) =>
      version ? ` — version ${version}` : ' — development build',
    about: (product: string) =>
      `${product} is an educational aid for critical appraisal, for journal club and for learning to read a paper. It is not clinical decision support: it gives no recommendation, no interpretation and no clinical advice, and it must not be used to make a decision about a patient. It also does not summarize papers. It gives you the appraisal template — PICO, the study design, the absolute effect with NNT, a validity checklist — and you fill it in, so every judgement in the summary is yours. Check what you write against the full text.`,
    notAffiliated: 'Not affiliated with NLM / NIH.',
    privacy: 'Privacy policy',
    report: 'Report a problem or suggest something',
  },
};

export type Messages = typeof en;
