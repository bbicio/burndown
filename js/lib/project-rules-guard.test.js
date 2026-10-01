import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(f, 'utf8');

describe('project rules are wired into the pages', () => {
  for (const page of ['costgrid.html', 'project-config.html', 'portfolio.html']) {
    it(`${page} loads js/lib/project-rules.js`, () => {
      expect(read(page)).toMatch(/js\/lib\/project-rules\.js\?v=\d+/);
    });
  }

  it('costgrid.html disables the currency menu with the version lock', () => {
    const t = read('costgrid.html');
    expect(t).toMatch(/id="cgCurrency"[^>]*:disabled="currencyLocked"/);
    expect(t).toMatch(/versionCurrencyLocked\(/);
  });

  it('project-config.html keeps the currency menu read-only and redirects the new-project form', () => {
    const t = read('project-config.html');
    expect(t).toMatch(/v-model="project\.currency"[^>]*disabled/);
    expect(t).toMatch(/DIRECT_PROJECT_CREATION_ENABLED/);
  });

  it('portfolio.html no longer links straight to the creation form', () => {
    const t = read('portfolio.html');
    expect(t).not.toMatch(/onclick="window\.location\.href='\/project-config\.html'"/);
    expect(t).toMatch(/DIRECT_PROJECT_CREATION_ENABLED/);
  });
});
