import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'program.html'), 'utf8');

describe('program.html shell', () => {
  it('uses the page shell without layout-breaking properties', () => {
    expect(html).toContain('<div id="app-shell">');
    expect(html).toContain('<div id="nav-container"></div>');
    expect(html).toContain('<div id="app-main">');
    expect(html).not.toMatch(/#app-(shell|main)\s*\{[^}]*(overflow|position|transform|filter|contain|will-change)/);
  });
  it('carries the sidebar head snippet and v-cloak', () => {
    expect(html).toContain("localStorage.getItem('PDash_sidebarCollapsed')");
    expect(html).toMatch(/id="app"[^>]*v-cloak/);
  });
  it('activates the Portfolio menu entry and the three-level breadcrumb', () => {
    expect(html).toContain('<title>PDash — Portfolio</title>');
    expect(html).toContain("initNav('portfolio'");
    expect(html).toContain("{ label: 'Portfolio', href: '/portfolio.html' }");
  });
  it('has no emoji, no hex literal and no Intl.NumberFormat', () => {
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![^<]*<\/title>)/);
    expect(html).not.toContain('Intl.NumberFormat');
  });
  it('has no native alert or confirm', () => {
    expect(html).not.toMatch(/\b(alert|confirm)\s*\(/);
  });
  it('shows the empty-program message (Review Focus 1)', () => {
    expect(html).toContain('No projects in this program are visible to you.');
  });
  it('shows the no-dated-projects burndown message (Review Focus 3)', () => {
    expect(html).toContain('No dated projects in this program');
  });
});
