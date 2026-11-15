/**
 * English messages (#82). The source of truth: `ja.ts` is typed against this
 * object, so a message added here and not translated fails the type check.
 *
 * A message that needs a value is a function. Plurals are decided inside the
 * function, because Japanese has none and English needs them.
 */

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
