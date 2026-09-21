import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Default environment is node: everything under src/lib is pure.
// Tests that need a DOM opt in per file with `// @vitest-environment happy-dom`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.d.ts'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
