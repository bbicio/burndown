import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(f, 'utf8');

describe('project rules are wired into the pages', () => {
  for (const page of ['costgrid.html', 'project-config.html', 'portfolio.html']) {
    it(`${page} loads js/lib/project-rules.js`, () => {
      expect(read(page)).toMatch(/js\/lib\/project-rules\.js\?v=\d+/);
    });
  }

  it('costgrid.html locks the currency menu with the version lock', () => {
    // 2026-10-07: the native <select id="cgCurrency"> became <cg-select>, whose `locked`
    // prop renders the padlocked, non-opening box and keeps `currencyLockTitle` as the title.
    const t = read('costgrid.html');
    expect(t).toMatch(/<cg-select[^>]*:options="currencyOptions"[\s\S]{0,200}?:locked="currencyLocked"/);
    expect(t).toMatch(/:locked-title="currencyLockTitle"/);
    expect(t).toMatch(/versionCurrencyLocked\(/);
  });

  it('costgrid.html reads this.cg when deciding whether the version has projects (Vue reactivity)', () => {
    // Generate project mutates the raw _cgDraft.linkedProjects and then reassigns the reactive `cg`
    // (renderCgVersionTabs); the lock must depend on `cg`, otherwise it stays stale until a reload.
    const t = read('costgrid.html');
    expect(t).toMatch(/versionHasProjects\(\)\s*\{[^}]*this\.cg\b/);
    expect(t).toMatch(/currencyLocked\(\)\s*\{\s*return this\.isLocked \|\| this\.versionHasProjects/);
  });

  it('project-config.html locks the currency menu for existing projects and viewers, and redirects the new-project form', () => {
    const t = read('project-config.html');
    expect(t).toMatch(/v-model="project\.currency"[^>]*:disabled="currencyLocked"/);
    // Only a brand-new project (reachable again when direct creation is re-enabled) may pick its currency.
    expect(t).toMatch(/currencyLocked\(\)\s*\{\s*return this\.isViewer \|\| !this\.isNewProject/);
    expect(t).toMatch(/DIRECT_PROJECT_CREATION_ENABLED/);
  });

  it('portfolio.html no longer links straight to the creation form', () => {
    const t = read('portfolio.html');
    expect(t).not.toMatch(/onclick="window\.location\.href='\/project-config\.html'"/);
    expect(t).toMatch(/DIRECT_PROJECT_CREATION_ENABLED/);
  });
});
