import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedSrc = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@restaurant/shared': sharedSrc } },
  test: {
    environment: 'node',
    include: ['apps/api/src/**/*.spec.ts', 'packages/shared/src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    globals: false,
  },
});
