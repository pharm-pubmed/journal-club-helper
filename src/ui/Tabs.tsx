/**
 * The PICO / Numbers / Validity / Export tablist (spec §3-4).
 *
 * Follows the WAI-ARIA tabs pattern: one tab stop for the whole list (roving
 * tabindex) and arrow keys to move between tabs. Selection is automatic — the
 * tab bodies are cheap to render, so focusing a tab shows it.
 */
import { useRef } from 'preact/hooks';
import { useMessages } from './i18n';
import { actions, useStore } from './store';
import type { TabId } from './store';

export const TAB_ORDER: readonly TabId[] = ['pico', 'numbers', 'validity', 'export'];

/** Shared with App so the tabpanel can point back at its tab. */
export function tabButtonId(id: TabId): string {
  return `jch-tab-${id}`;
}

export function tabPanelId(id: TabId): string {
  return `jch-tabpanel-${id}`;
}

export function Tabs() {
  const activeTab = useStore((s) => s.activeTab);
  const m = useMessages();
  const listRef = useRef<HTMLDivElement>(null);

  const select = (id: TabId, moveFocus: boolean): void => {
    actions.setActiveTab(id);
    if (moveFocus) {
      listRef.current?.querySelector<HTMLButtonElement>(`#${tabButtonId(id)}`)?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const index = TAB_ORDER.indexOf(activeTab);
    const last = TAB_ORDER.length - 1;
    let next: TabId | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        next = TAB_ORDER[index <= 0 ? last : index - 1];
        break;
      case 'ArrowRight':
        next = TAB_ORDER[index >= last ? 0 : index + 1];
        break;
      case 'Home':
        next = TAB_ORDER[0];
        break;
      case 'End':
        next = TAB_ORDER[last];
        break;
      default:
        return;
    }
    if (!next) return;
    event.preventDefault();
    select(next, true);
  };

  return (
    <div
      class="tabs"
      role="tablist"
      aria-label={m.tabs.listLabel}
      ref={listRef}
      onKeyDown={onKeyDown}
    >
      {TAB_ORDER.map((id) => (
        <button
          key={id}
          id={tabButtonId(id)}
          class="tabs__tab"
          type="button"
          role="tab"
          aria-selected={id === activeTab}
          aria-controls={tabPanelId(id)}
          tabIndex={id === activeTab ? 0 : -1}
          onClick={() => select(id, false)}
        >
          {m.tabs[id]}
        </button>
      ))}
    </div>
  );
}
