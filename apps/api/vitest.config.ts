import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // PGlite (Postgres in WebAssembly) needs about a second to start.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
