/**
 * Panel header: which article the panel is bound to, plus the slot the design
 * detection UI mounts into (issue #8, spec §3-3).
 */
import { DesignHeader } from './DesignHeader';
import { useStore } from './store';
import { PRODUCT_NAME } from './labels';
import type { PubMedArticle } from '../lib/types';

const PUBMED_RECORD = 'https://pubmed.ncbi.nlm.nih.gov/';

function citationLine(article: PubMedArticle): string {
  const first = article.authors[0];
  const byline = first ? (article.authors.length > 1 ? `${first} et al.` : first) : '';
  return [byline, article.journal, article.year].filter((part) => part !== '').join(' · ');
}

export function Header() {
  const article = useStore((s) => s.article);
  const status = useStore((s) => s.status);
  // The bound article survives a tab switch, but showing its title while the
  // body says "open an abstract" would misstate what is loaded.
  const bound = status === 'ready' ? article : null;
  const citation = bound ? citationLine(bound) : '';

  return (
    <header class="header">
      <h1 class="header__title">{bound ? bound.title : PRODUCT_NAME}</h1>
      {bound ? (
        <p class="header__citation">
          {citation === '' ? null : `${citation} · `}
          <a
            class="header__link"
            href={`${PUBMED_RECORD}${bound.pmid}/`}
            target="_blank"
            rel="noreferrer"
          >
            PMID {bound.pmid}
          </a>
        </p>
      ) : null}
      {/* Issue #8 renders the study-design detection and override control here. */}
      <div class="header__slot">
        <DesignHeader />
      </div>
    </header>
  );
}
