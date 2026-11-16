import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['js/**/*.test.js', 'scripts/**/*.test.js'],
    setupFiles: ['scripts/lib/page-source.setup.mjs'],
  },
});
