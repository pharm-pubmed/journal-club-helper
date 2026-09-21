import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Permissions are fixed by SPEC.ja.md §5. Adding any entry here requires an
// explicit decision (see issue #1) because it changes the store review surface.
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modulesDir: 'src/modules',
  vite: () => ({
    plugins: [preact()],
  }),
  hooks: {
    /**
     * Drops the `side_panel.default_path` WXT derives from the sidepanel
     * entrypoint (#43).
     *
     * That key is what makes the panel *globally* available, and a global panel
     * is one panel for the whole window: once the reader opened it, it followed
     * them onto every other site, showing "Open a PubMed abstract page to start"
     * on top of whatever they were reading. Per-tab `setOptions({enabled:false})`
     * does not override it — measured in Chrome 153, where the non-PubMed tab
     * kept the 386px panel until this key was gone. The panel is now handed to
     * one tab at a time by `src/entrypoints/background.ts`.
     */
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.side_panel;
    },
  },
  manifest: {
    name: 'Journal Club Helper: Critical Appraisal for PubMed',
    short_name: 'Journal Club Helper',
    description:
      'Turn a PubMed abstract into a structured critical appraisal: study design, PICO, absolute effect with NNT, and a validity checklist.',
    minimum_chrome_version: '116',
    // activeTab was in spec §5 but is provably unused: chrome.tabs.query needs no
    // permission at all, and tabs.sendMessage is covered by the host permission
    // below. Removed after the Chrome manual QA in #25; see HANDOVER §7.
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://pubmed.ncbi.nlm.nih.gov/*'],
    // Only the host the E-utilities fallback (#23) will ask for. The AI provider
    // hosts were declared here before any code could request them, which leaves
    // a store reviewer asking what the extension does with api.anthropic.com and
    // the shipped code having no answer. They come back with #34/#35 in v0.2.
    optional_host_permissions: ['https://eutils.ncbi.nlm.nih.gov/*'],
    action: {
      default_title: 'Open Journal Club Helper',
    },
    // options_ui is derived by WXT from src/entrypoints/options. `side_panel` is
    // derived too, and then removed again by the hook above — see #43.
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
  },
});
