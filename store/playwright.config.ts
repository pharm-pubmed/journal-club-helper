import { defineConfig } from '@playwright/test';

// Store listing assets (#27): `pnpm store:assets`. Not a test suite and not run in CI.
export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
});
