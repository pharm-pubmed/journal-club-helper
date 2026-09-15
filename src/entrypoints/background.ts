import { defineBackground } from 'wxt/utils/define-background';

// Placeholder until issue #5. The background worker stays minimal and stateless
// (spec §9): its only job is opening the side panel on a user gesture.
export default defineBackground(() => {});
