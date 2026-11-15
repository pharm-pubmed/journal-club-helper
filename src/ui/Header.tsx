/**
 * Panel header: which article the panel is bound to, plus the slot the design
 * detection UI mounts into (issue #8, spec §3-3).
 */
import { DesignHeader } from './DesignHeader';
import { useStore } from './store';
import { useMessages } from './i18n';
import type { PubMedArticle } from '../lib/types';
import type { Messages } from '../locales';

const PUBMED_RECORD = 'https://pubmed.ncbi.nlm.nih.gov/';

function citationLine(article: PubMedArticle, m: Messages): string {
  const first = article.authors[0];
  const byline = first ? (article.authors.length > 1 ? `${first} ${m.header.etAl}` : first) : '';
  // Says where the record came from when it was not the page the reader sees (#23).
  const via = article.source === 'eutils' ? m.header.viaEutils : '';
  return [byline, article.journal, article.year, via].filter((part) => part !== '').join(' · ');
}

export function Header() {
  const article = useStore((s) => s.article);
  const status = useStore((s) => s.status);
  const m = useMessages();
  // The bound article survives a tab switch, but showing its title while the
  // body says "open an abstract" would misstate what is loaded.
  const bound = status === 'ready' ? article : null;
  const citation = bound ? citationLine(bound, m) : '';

  return (
    <header class="header">
      <h1 class="header__title">{bound ? bound.title : m.common.productName}</h1>
      {bound ? (
        <p class="header__citation">
          {citation === '' ? null : `${citation} · `}
          <a
            class="header__link"
            href={`${PUBMED_RECORD}${bound.pmid}/`}
            target="_blank"
            rel="noreferrer"
          >
            {m.header.pmid(bound.pmid)}
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
