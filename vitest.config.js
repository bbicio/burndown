import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['js/**/*.test.js', 'scripts/**/*.test.js'],
    // The site-export command's tests run only through `npm run test:site-export` (vitest.site-export.config.js).
    exclude: [...configDefaults.exclude, 'scripts/site-export/**'],
    setupFiles: ['scripts/lib/page-source.setup.mjs'],
  },
});
