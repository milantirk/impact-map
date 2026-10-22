import { defineConfig } from 'vitest/config';

// Each workspace owns its vitest/vite config. Coverage is merged here for SonarCloud.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/main.tsx', '**/index.ts'],
    },
  },
});
