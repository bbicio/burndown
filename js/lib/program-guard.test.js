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

describe('program.html List view', () => {
  it('has the eight column headers (title case, CSS text-transform:uppercase per .pf-list-header convention) and the PROGRAM TOTAL row', () => {
    expect(html).toMatch(/>Project</);
    expect(html).toMatch(/>Status</);
    expect(html).toMatch(/>Sold</);
    expect(html).toMatch(/>Spent</);
    expect(html).toMatch(/>Remaining</);
    expect(html).toMatch(/>Consumption</);
    expect(html).toMatch(/>Vs time</);
    expect(html).toContain('PROGRAM TOTAL');
  });
  it('shows the no-budget/no-actuals/mixed-currency states and the reporting-scope note', () => {
    expect(html).toContain('No budget');
    expect(html).toContain('No actuals');
    expect(html).toContain('Mixed currencies');
    expect(html).toContain("Task, role and entry analysis is in each project's reporting");
  });
  it('has a List | Timeline segmented control', () => {
    expect(html).toContain('>List<');
    expect(html).toContain('>Timeline<');
  });
});

describe('program.html Timeline view', () => {
  it('has the legend and the Today label', () => {
    expect(html).toContain('Project duration');
    expect(html).toContain('Budget consumed (amber ≥85%, red over sold)');
    expect(html).toContain('Not started');
    expect(html).toContain('Today');
  });
  it('is only shown from min-width: 1024px in css/portfolio.css', () => {
    const css = readFileSync(join(process.cwd(), 'css', 'portfolio.css'), 'utf8');
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)\s*\{[^}]*\.pg-timeline/s);
  });
});

describe('program.html Program burndown chart', () => {
  it('has the title, subtitle and legend labels', () => {
    expect(html).toContain('Program burndown');
    expect(html).toContain('Sum of remaining hours across');
    expect(html).toContain('Remaining hours (actual)');
    expect(html).toContain('Remaining hours planned (phasing)');
  });
  it('has the no-dated-projects message and a PNG download button', () => {
    expect(html).toContain('No dated projects in this program');
    expect(html).toMatch(/download\s+PNG/i);
  });
  it('reads series colors through chartColor(), never a hex literal', () => {
    expect(html).toMatch(/chartColor\(\s*'--chart-actual'/);
    expect(html).toMatch(/chartColor\(\s*'--chart-phasing'/);
  });
});

describe('program-calc.js\'s portfolio-calc.js import stays cache-bust-aligned (final review finding 5)', () => {
  it('the ES import version matches the <script> tag version program.html loads', () => {
    const programCalc = readFileSync(join(process.cwd(), 'js', 'lib', 'program-calc.js'), 'utf8');
    const importMatch = programCalc.match(/from '\.\/portfolio-calc\.js(\?v=(\d+))?'/);
    const scriptMatch = html.match(/js\/lib\/portfolio-calc\.js\?v=(\d+)/);
    expect(importMatch, 'program-calc.js must import portfolio-calc.js').not.toBeNull();
    expect(scriptMatch, 'program.html must load portfolio-calc.js via a versioned <script> tag').not.toBeNull();
    expect(importMatch[2], 'the import has no ?v= — a future bump to the script tag would silently miss it').toBeDefined();
    expect(importMatch[2]).toBe(scriptMatch[1]);
  });
});
