// `npm run test:site-export`: only the site-export command's tests, which the default suite excludes.
import { defineConfig, configDefaults } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  test: {
    ...base.test,
    include: ['scripts/site-export/**/*.test.js'],
    exclude: [...configDefaults.exclude],
  },
});
