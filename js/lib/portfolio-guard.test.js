import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('portfolio.html');
const css = read('css/portfolio.css');
const start = html.indexOf("view === 'overview'");
const end = start + html.slice(start).search(/\r?\n {2}<\/template>\r?\n\r?\n {2}<template v-else>/);
const overview = html.slice(start, end);
// Dead code kept commented-out (the pre-existing "Budget Summary panel", hidden
// 2026-09, untouched by this cycle) must not trip the active-view checks below.
const overviewActive = overview.replace(/<!--[\s\S]*?-->/g, '');

describe('portfolio overview guard', () => {
  it('locates the overview template', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(overview).toContain('pf-card-grid');
    expect(overview).toContain('pf-list');
  });

  it('portfolio.css is linked (versioned) by portfolio.html and program.html', () => {
    expect(html).toMatch(/css\/portfolio\.css\?v=\d+/);
    const others = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'portfolio.html' && f !== 'program.html');
    others.forEach(f => expect(read(f), f).not.toContain('portfolio.css'));
  });

  it('has no hex colour literals in portfolio.css or the overview template', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(overviewActive).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('overview template has no emoji', () => {
    expect(overviewActive).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('every portfolio.css reference is ?v=3', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/portfolio\.css\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('3');
      }
    });
    expect(found).toBeGreaterThan(0);
  });

  // Vue 3's runtime template compiler resolves a bare identifier through the component
  // instance ONLY — it never falls through to `window`, even though the function is a real
  // global (see the file's own comment near `isPinnedSummary`). A module-bridged helper
  // called bare in the template (not through `this.` or another method) must be re-exposed
  // via a shorthand entry in `methods`, the same way `getClientName`/`pipelineBadge` already
  // are — otherwise the whole overview silently renders as `<!---->`.
  // There are 9 visible cells per .pf-list-row (chevron, main, stage, status, duration,
  // sold, spent, variance, actions); the three narrow breakpoints hide duration+spent,
  // leaving 7. Each grid-template-columns declaration must have exactly that many tracks,
  // or columns silently misalign/wrap (found by code review: the narrow templates had 6).
  it('.pf-list-row grid-template-columns declarations have the right track count', () => {
    const countTracks = v => v.replace(/,\s*(?=[^()]*\))/g, ',').split(/\s+(?![^(]*\))/).filter(Boolean).length;
    // `.pf-list-row\s*\{` (brace directly after, only whitespace in between) matches the base
    // rule and the three `html[...] .pf-list-row { ... }` narrow overrides, but not
    // `.pf-list-row:first-child { ... }` (a `:` sits between the class and the brace there).
    const bodies = [...css.matchAll(/\.pf-list-row\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(bodies).toHaveLength(4);
    const decls = bodies.map(b => b.match(/grid-template-columns:\s*([^;]+);/)[1]);
    expect(countTracks(decls[0])).toBe(9); // full-width
    decls.slice(1).forEach(d => expect(countTracks(d)).toBe(7)); // the three narrow breakpoints
  });

  it('activates the Program Dashboard entry points (Task 7)', () => {
    expect(html).not.toContain('Program Dashboard — coming soon');
    const links = [...html.matchAll(/\/program\.html\?programId=/g)];
    expect(links.length).toBeGreaterThanOrEqual(3);
  });
  it('the project reporting view links to its program (Task 7)', () => {
    expect(html).toContain('Program Dashboard →');
  });
  it('the sibling-project switcher dropdown has a Program Dashboard entry at the bottom (final review finding 3)', () => {
    const start = html.indexOf('pr-switch-menu');
    const end = html.indexOf('<!-- /pr-switch -->', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const dropdown = html.slice(start, end);
    expect(dropdown).toContain('goProgramDashboard');
    expect(dropdown).toContain('Program Dashboard →');
  });
  it('redirects an invalid/missing programId with a notice the Portfolio page displays (final review finding 2)', () => {
    expect(html).toContain("'program-not-found'");
  });
  it('the program-not-found notice does not claim a visibility case program.html never redirects for', () => {
    // program.html redirects only on a missing programId or a program that does not
    // exist; zero visible projects renders the empty state instead of bouncing back.
    const start = html.indexOf("'program-not-found'");
    expect(start).toBeGreaterThan(-1);
    expect(html.slice(start, start + 200)).not.toMatch(/no projects visible/i);
  });

  it('spentPercent and spentBarState, called bare in the overview template, are registered in methods', () => {
    expect(overviewActive).toMatch(/\bspentPercent\(/);
    expect(overviewActive).toMatch(/\bspentBarState\(/);
    // Scan the whole `methods` object (up to the sibling `watch` option) rather than a
    // fixed character window: adding a method above these would otherwise push them out
    // of the window and fail the guard with a misleading message.
    const methodsStart = html.indexOf('methods: {');
    expect(methodsStart).toBeGreaterThan(-1);
    const methodsEnd = html.indexOf('watch: {', methodsStart);
    expect(methodsEnd).toBeGreaterThan(methodsStart);
    const methodsBlock = html.slice(methodsStart, methodsEnd);
    expect(methodsBlock).toMatch(/\bspentPercent,/);
    expect(methodsBlock).toMatch(/\bspentBarState,/);
  });
});

// The project reporting view (spec 2026-10-15, tavola 7.4): the `<template v-else>` that
// follows the overview, up to the template's closing tag before `</div>` of #app.
const dashStart = end;
const dashEnd = dashStart + html.slice(dashStart).search(/\r?\n {2}<\/template>\r?\n\r?\n<\/div>/);
const dashboard = html.slice(dashStart, dashEnd);
const dashboardActive = dashboard.replace(/<!--[\s\S]*?-->/g, '');

describe('project reporting view', () => {
  const headEnd = dashboard.indexOf('<!-- /pr-kpis -->');
  const head = dashboard.slice(0, headEnd).replace(/<!--[\s\S]*?-->/g, '');

  it('locates the view template and its header/KPI region', () => {
    expect(dashEnd).toBeGreaterThan(dashStart);
    expect(headEnd).toBeGreaterThan(0);
  });

  it('header and KPIs have no emoji and no hex colour', () => {
    expect(head).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(head).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('carries the header, switch and KPI copy', () => {
    ['Project Portfolio', 'Projects in program', 'Hours on track', 'Hours ahead of time', 'Hours behind time', 'No budget', 'Time elapsed']
      .forEach(t => expect(dashboardActive, t).toContain(t));
  });

  it('keeps the four actions and their gating', () => {
    ['goConfigure', 'triggerLoadActuals', 'goPlanningForProject', "openShareModal('project'"]
      .forEach(t => expect(head, t).toContain(t));
    expect(head.split("my_permission !== 'viewer'").length - 1).toBeGreaterThanOrEqual(2);
  });

  it('drops the "← Portfolio" buttons', () => {
    expect(dashboardActive).not.toContain('← Portfolio');
  });
});

describe('project reporting view — Progress card', () => {
  const pStart = dashboard.indexOf('<!-- /pr-kpis -->');
  const pEnd = dashboard.indexOf('<!-- /pr-progress -->');
  const progress = dashboard.slice(pStart, pEnd).replace(/<!--[\s\S]*?-->/g, '');
  const rStart = html.indexOf('renderBurndownChart() {');
  const render = html.slice(rStart, html.indexOf('exportChartPng() {', rStart));

  it('locates the Progress card', () => {
    expect(pStart).toBeGreaterThan(-1);
    expect(pEnd).toBeGreaterThan(pStart);
    expect(rStart).toBeGreaterThan(-1);
  });

  it('carries the Progress copy and the empty state', () => {
    ['Progress', 'Burndown', 'Monthly summary', 'Pass-through', 'Remaining hours (actual)', 'Remaining hours planned', 'No actuals loaded yet.', 'current']
      .forEach(t => expect(progress, t).toContain(t));
  });

  it('has no emoji, no hex and no ExportButtons', () => {
    expect(progress).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(progress).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(progress).not.toContain('<ExportButtons');
    expect(progress).not.toContain('<export-buttons');
  });

  it('gates the empty-state Load Actuals like the header', () => {
    expect(progress).toContain('triggerLoadActuals');
    expect(progress).toContain("my_permission !== 'viewer'");
  });

  it('draws two series with the shared Today plugin', () => {
    expect(render).toContain('todayLabelPlugin(');
    expect(render).toContain("chartColor('--chart-actual'");
    expect(render).toContain("chartColor('--chart-phasing'");
    expect(render).not.toContain('Estimated Hours');
  });
});

describe('project reporting view — Breakdown card', () => {
  const bStart = dashboard.indexOf('<!-- /pr-progress -->');
  const bEnd = dashboard.indexOf('<!-- /pr-breakdown -->');
  const breakdown = dashboard.slice(bStart, bEnd).replace(/<!--[\s\S]*?-->/g, '');

  it('locates the Breakdown card', () => {
    expect(bStart).toBeGreaterThan(-1);
    expect(bEnd).toBeGreaterThan(bStart);
  });

  it('carries the Breakdown and Period copy', () => {
    ['Breakdown', 'By task', 'By role', 'By functional area', 'No functional areas configured', 'Remaining (total)', 'Total consumption', 'Over sold', 'Whole project', 'Custom range', 'Reset']
      .forEach(t => expect(breakdown, t).toContain(t));
  });

  it('has no emoji and no hex', () => {
    expect(breakdown).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(breakdown).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('drops the period-filter card and the three summary cards', () => {
    ['In period', 'Summary by task', 'Summary by role', 'Summary by functional area', 'Period filter']
      .forEach(t => expect(dashboardActive, t).not.toContain(t));
  });
});

describe('project reporting view — task expansion and entries', () => {
  it('carries the expansion, entries and excluded copy', () => {
    ['Entries ·', 'Export XLS', 'entries', 'No entries in the selected period.', 'Excluded from report', 'Role (resource)', 'Amount', 'Note']
      .forEach(t => expect(dashboardActive, t).toContain(t));
  });

  it('drops the old Task detail section', () => {
    ['By owner', 'Chronological entries', 'Expand details', 'Task detail']
      .forEach(t => expect(dashboardActive, t).not.toContain(t));
  });

  it('the whole view has no emoji, no hex and no ExportButtons', () => {
    expect(dashboardActive).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(dashboardActive).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('ExportButtons');
    expect(html).not.toContain('<export-buttons');
  });
});
