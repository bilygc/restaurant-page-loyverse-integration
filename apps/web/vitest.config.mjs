import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve the shared contract straight from SOURCE (not its built dist) so the
// pure lib helpers can be unit-tested without touching packages/shared.
const root = fileURLToPath(new URL('.', import.meta.url));
const sharedSrc = fileURLToPath(
  new URL('../../packages/shared/src/index.ts', import.meta.url),
);

export default defineConfig({
  // Self-contained: discovery + aliases are relative to apps/web regardless of
  // the directory npm was invoked from.
  root,
  resolve: {
    alias: {
      '@restaurant/shared': sharedSrc,
    },
  },
  test: {
    environment: 'node', // pure helpers only; no DOM / jsdom / network needed
    include: ['lib/**/*.spec.ts'],
    globals: false, // describe/it/expect are imported explicitly in each spec
  },
});
