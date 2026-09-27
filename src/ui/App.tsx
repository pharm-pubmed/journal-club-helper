/**
 * Side panel shell (issue #6): header, tablist, active tab body, footer.
 *
 * Side effects belong in `useAppraisalSession`, not here: this component only
 * reflects the store, so a tab can be replaced without touching it.
 */
import { EmptyState } from './EmptyState';
import { Header } from './Header';
import { Tabs, tabButtonId, tabPanelId } from './Tabs';
import { useAppraisalSession } from './hooks/useAppraisalSession';
import { useArticle } from './hooks/useArticle';
import { useStore } from './store';
import type { TabId } from './store';
import { ExportTab } from './tabs/ExportTab';
import { NumbersTab } from './tabs/NumbersTab';
import { PicoTab } from './tabs/PicoTab';
import { ValidityTab } from './tabs/ValidityTab';

function TabBody({ id }: { id: TabId }) {
  switch (id) {
    case 'pico':
      return <PicoTab />;
    case 'numbers':
      return <NumbersTab />;
    case 'validity':
      return <ValidityTab />;
    case 'export':
      return <ExportTab />;
  }
}

function openOptions(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.openOptionsPage) return;
  void chrome.runtime.openOptionsPage();
}

function GearIcon() {
  return (
    <svg
      class="icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12.71 6.33L14.92 6.97L14.92 9.03L12.71 9.67L12.51 10.15L13.63 12.16L12.16 13.63L10.15 12.51L9.67 12.71L9.03 14.92L6.97 14.92L6.33 12.71L5.85 12.51L3.84 13.63L2.37 12.16L3.49 10.15L3.29 9.67L1.08 9.03L1.08 6.97L3.29 6.33L3.49 5.85L2.37 3.84L3.84 2.37L5.85 3.49L6.33 3.29L6.97 1.08L9.03 1.08L9.67 3.29L10.15 3.49L12.16 2.37L13.63 3.84L12.51 5.85Z" />
      <circle cx="8" cy="8" r="2.3" />
    </svg>
  );
}

export function App() {
  const { article, status, reload, fetchFromNcbi } = useArticle();
  useAppraisalSession(article);
  const error = useStore((s) => s.error);
  const unreadablePmid = useStore((s) => s.unreadablePmid);
  const ncbiPending = useStore((s) => s.ncbiPending);
  const activeTab = useStore((s) => s.activeTab);
  const ready = status === 'ready';

  return (
    <div class="panel">
      <Header />
      {ready ? <Tabs /> : null}
      <main class="panel__body">
        {ready ? (
          <div
            class="tabpanel"
            role="tabpanel"
            id={tabPanelId(activeTab)}
            aria-labelledby={tabButtonId(activeTab)}
            tabIndex={0}
          >
            <TabBody id={activeTab} />
          </div>
        ) : (
          <EmptyState
            status={status}
            message={error}
            pmid={unreadablePmid}
            ncbiPending={ncbiPending}
            onRetry={reload}
            onFetchFromNcbi={fetchFromNcbi}
          />
        )}
      </main>
      <footer class="footer">
        <span class="footer__note">Educational appraisal aid — not clinical advice.</span>
        <button
          class="icon-button"
          type="button"
          onClick={openOptions}
          title="Settings"
          aria-label="Settings"
        >
          <GearIcon />
        </button>
      </footer>
    </div>
  );
}
