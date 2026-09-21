/** What the panel shows whenever no article is bound (issue #6). */
import type { ArticleStatus } from './store';

export interface EmptyStateProps {
  status: ArticleStatus;
  /** `store.error`: set for 'error', and for the "page could not be read" case. */
  message: string | null;
  onRetry: () => void;
}

const NO_ARTICLE = 'Open a PubMed abstract page to start';

const NO_ARTICLE_HINT =
  'The panel reads the abstract of a single record — a pubmed.ncbi.nlm.nih.gov address ending in a PMID. Search results and other sites are not read.';

export function EmptyState({ status, message, onRetry }: EmptyStateProps) {
  if (status === 'error') {
    return (
      <div class="empty empty--error" role="status">
        <p class="empty__title">The panel could not read this page</p>
        {message ? <p class="empty__hint">{message}</p> : null}
        <button class="button" type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (status === 'unsupported') {
    return (
      <div class="empty" role="status">
        <p class="empty__title">{NO_ARTICLE}</p>
        <p class="empty__hint">{message ?? NO_ARTICLE_HINT}</p>
      </div>
    );
  }

  return (
    <div class="empty" role="status">
      <p class="empty__hint">Looking for a PubMed abstract…</p>
    </div>
  );
}
