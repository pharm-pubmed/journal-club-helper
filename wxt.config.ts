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
  manifest: {
    name: 'Journal Club Helper: Critical Appraisal for PubMed',
    short_name: 'Journal Club Helper',
    description:
      'Turn a PubMed abstract into a structured critical appraisal: study design, PICO, absolute effect with NNT, and a validity checklist.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: ['https://pubmed.ncbi.nlm.nih.gov/*'],
    optional_host_permissions: [
      'https://eutils.ncbi.nlm.nih.gov/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
    ],
    action: {
      default_title: 'Open Journal Club Helper',
    },
    // side_panel and options_ui are derived by WXT from the entrypoints
    // (src/entrypoints/sidepanel, src/entrypoints/options).
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
  },
});
