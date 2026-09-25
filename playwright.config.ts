import { defineConfig } from '@playwright/test';

// A live run waits for a human to pass PubMed's browser check (tests/e2e/fixtures.ts).
const live = process.env.JCH_LIVE === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  // *.spec.ts, so Vitest's tests/**/*.test.ts never picks these up.
  testMatch: '*.spec.ts',
  // One browser at a time: a live run shares one persistent profile.
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: live ? 10 * 60_000 : 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
