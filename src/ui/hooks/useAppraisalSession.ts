/**
 * Everything that has to happen once per bound article, in one place.
 *
 * Integration layer for issues #6, #8, #18 and #22. It lives here rather than in
 * `App.tsx` so the component stays a pure reflection of the store, and so the
 * order of these three effects is written down in one file:
 *
 *   1. `useAutosave` restores the saved appraisal for the bound PMID, then
 *      debounces every later edit back to `chrome.storage.local`.
 *   2. `runClassification` detects the study design from the article.
 *   3. `panelOpens` is counted once per distinct PMID.
 *
 * Classification is synchronous and the restore is not, so (2) always lands
 * first and (3) never double-counts a tab switch back to the same article. A
 * restore that carries a stored `designDetected` writes the same value (same
 * article in, same rules), and a stored `designOverride` survives either way
 * because `runClassification` never touches it.
 */
import { useEffect, useRef } from 'preact/hooks';
import { incrementCounter } from '../../lib/counters';
import type { PubMedArticle } from '../../lib/types';
import { useAutosave } from './useAutosave';
import { runClassification } from './useDesign';

export function useAppraisalSession(article: PubMedArticle | null): void {
  useAutosave();

  const boundPmid = useRef<string | null>(null);

  useEffect(() => {
    const pmid = article?.pmid ?? null;
    if (pmid === boundPmid.current) return;
    boundPmid.current = pmid;

    runClassification(article);
    // Spec §7: counted locally, shown back in the options page, never sent anywhere.
    if (pmid !== null) void incrementCounter('panelOpens');
  }, [article]);
}
