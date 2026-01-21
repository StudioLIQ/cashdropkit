import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      // Exclude manual test runners (non-vitest pattern)
      '**/db.test.ts',
    ],
  },
});
