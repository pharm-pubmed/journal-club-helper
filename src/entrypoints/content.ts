import { defineContentScript } from 'wxt/utils/define-content-script';

// Placeholder until issues #4 and #5.
export default defineContentScript({
  matches: ['https://pubmed.ncbi.nlm.nih.gov/*'],
  runAt: 'document_idle',
  main() {},
});
