/** What the panel shows whenever no article is bound (issue #6). */
import { useMessages } from './i18n';
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

function Unreadable({
  message,
  pmid,
  ncbiPending,
  onRetry,
  onFetchFromNcbi,
}: Omit<EmptyStateProps, 'status'>) {
  const busy = ncbiPending !== null;
  const m = useMessages();
  return (
    <div class="empty">
      <h2 class="empty__title">{m.empty.unreadableTitle}</h2>
      <p class="empty__hint">{m.empty.unreadableHint(pmid)}</p>
      <p class="empty__hint" role="status">
        {busy ? m.empty.fetching(ncbiPending) : ''}
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
          {m.empty.fetchFromNcbi}
        </button>
        <button class="button" type="button" onClick={onRetry} disabled={busy}>
          {m.empty.readAgain}
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
  const m = useMessages();
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
        <p class="empty__title">{m.empty.errorTitle}</p>
        {message ? <p class="empty__hint">{message}</p> : null}
        <button class="button" type="button" onClick={onRetry}>
          {m.empty.retry}
        </button>
      </div>
    );
  }

  if (status === 'unsupported') {
    // With a message, this is a record NCBI confirmed has nothing to appraise.
    return (
      <div class="empty" role="status">
        <p class="empty__title">{message ? m.empty.nothingToAppraise : m.empty.noArticle}</p>
        <p class="empty__hint">{message ?? m.empty.noArticleHint}</p>
      </div>
    );
  }

  return (
    <div class="empty" role="status">
      <p class="empty__hint">{m.empty.looking}</p>
    </div>
  );
}
