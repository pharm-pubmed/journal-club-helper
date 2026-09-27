/** What the panel shows whenever no article is bound (issue #6). */
import type { ArticleStatus } from './store';

export interface EmptyStateProps {
  status: ArticleStatus;
  /** `store.error`: set for 'error', and for the "page could not be read" cases. */
  message: string | null;
  /** Set while 'unreadable'. */
  pmid: string | null;
  /** Set from the click on "Fetch from NCBI" until NCBI has answered. */
  ncbiPending: string | null;
  onRetry: () => void;
  onFetchFromNcbi: () => void;
}

const NO_ARTICLE = 'Open a PubMed abstract page to start';

const NO_ARTICLE_HINT =
  'The panel reads the abstract of a single record — a pubmed.ncbi.nlm.nih.gov address ending in a PMID. Search results and other sites are not read.';

function Unreadable({
  message,
  pmid,
  ncbiPending,
  onRetry,
  onFetchFromNcbi,
}: Omit<EmptyStateProps, 'status'>) {
  const busy = ncbiPending !== null;
  return (
    <div class="empty">
      <h2 class="empty__title">The abstract on this page could not be read</h2>
      <p class="empty__hint">
        The record may have no abstract (letters and editorials often do not), or PubMed may have
        changed its layout. The same record can be fetched from NCBI’s E-utilities service instead.
        Only the PMID{pmid ? ` (${pmid})` : ''} and this extension’s name are sent. Your browser
        asks for permission the first time.
      </p>
      <p class="empty__hint" role="status">
        {busy ? `Fetching PMID ${ncbiPending} from NCBI…` : ''}
      </p>
      {message && !busy ? (
        <p class="empty__hint empty__hint--error" role="alert" id="empty-error">
          {message}
        </p>
      ) : null}
      <div class="empty__actions">
        <button
          class="button button--primary"
          type="button"
          onClick={onFetchFromNcbi}
          disabled={busy}
          aria-describedby={message && !busy ? 'empty-error' : undefined}
        >
          Fetch from NCBI
        </button>
        <button class="button" type="button" onClick={onRetry} disabled={busy}>
          Read the page again
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  status,
  message,
  pmid,
  ncbiPending,
  onRetry,
  onFetchFromNcbi,
}: EmptyStateProps) {
  if (status === 'unreadable') {
    return (
      <Unreadable
        message={message}
        pmid={pmid}
        ncbiPending={ncbiPending}
        onRetry={onRetry}
        onFetchFromNcbi={onFetchFromNcbi}
      />
    );
  }

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
    // With a message, this is a record NCBI confirmed has nothing to appraise.
    return (
      <div class="empty" role="status">
        <p class="empty__title">{message ? 'Nothing to appraise on this page' : NO_ARTICLE}</p>
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
