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

  it('the custom-range From calendar is anchored to the left edge of the menu', () => {
    const m = css.match(/\.pr-period-custom-row > \.cg-ctl:first-child \.cg-pop\.cg-pop--inline\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/left:\s*0/);
    expect(m[0]).toMatch(/right:\s*auto/);
  });

  it('every portfolio.css reference is ?v=9', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/portfolio\.css\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('9');
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
    ['</ph-icon>Portfolio</a>', 'Projects in program', 'Hours on track', 'Hours ahead of time', 'Hours behind time', 'No budget', 'Time elapsed']
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
  it('carries the excluded-tasks copy (the Entries copy lives in the pr-entries template)', () => {
    ['Excluded from report']
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

describe('project reporting view — visual fidelity pass (Task 7)', () => {
  it('has no in-page breadcrumb (the global one is the only breadcrumb)', () => {
    expect(dashboardActive).not.toContain('aria-label="breadcrumb"');
  });
  it('hides the Breakdown Remaining column below 1280px, where the sidebar leaves too little width', () => {
    const m = css.match(/@media \(max-width: 1279\.98px\) \{([\s\S]*?)\n\}/g) || [];
    expect(m.some(b => /\.pr-bd-remaining\s*\{\s*display:\s*none/.test(b))).toBe(true);
  });
  it('never breaks a KPI figure inside itself; "of …" wraps as a whole', () => {
    expect(css).toMatch(/\.pr-kpis \.pg-tile-value\s*\{[^}]*white-space:\s*nowrap[^}]*\}/);
    expect(css).toMatch(/\.pr-kpis \.pg-tile-value\s*\{[^}]*flex-wrap:\s*wrap[^}]*\}/);
  });
});

describe('project reporting view — Gate 3 review fixes', () => {
  it('keeps the Pass-through view reachable without actuals', () => {
    expect(dashboardActive).toContain(`v-if="!dashboardData.length && progressView !== 'ptc'" class="pr-empty"`);
  });
  it('says "Cumulative hours" / "consumed" when there is no budget', () => {
    expect(dashboardActive).toContain(`'Cumulative hours' : 'Remaining hours (actual)'`);
    expect(html).toContain(`budget !== null ? 'left' : 'consumed'`);
  });
  it('shows no Today marker without project dates and bounds it by the axis', () => {
    expect(html).toMatch(/if \(!s \|\| !cfg\?\.startDate \|\| !cfg\?\.endDate\) return null;/);
    expect(html).toContain('return s.todayIndex;');
  });
  it('resets the period filter and the task expansion on a project switch', () => {
    const m = html.match(/showDashboard\(pid\) \{([\s\S]*?)\n      \},/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('this.resetDateFilter();');
    expect(m[1]).toContain('this.entriesState = {};');
  });
  it('reads "—" for Sold and Remaining without a sold reference', () => {
    expect(dashboardActive).toContain(`!it.row.soldKnown ? '—' : fmtH(it.row.soldHours)`);
    expect(dashboardActive).toContain(`!breakdown.total.soldKnown ? '—' : fmtH(breakdown.total.soldHours)`);
    expect(dashboardActive).toContain(`sr.soldKnown ? fmtH(sr.soldHours) : '—'`);
  });
  it('makes the task and excluded rows keyboard-operable through a real button', () => {
    expect(dashboardActive).not.toMatch(/@keydown\.enter\.space\.prevent=/);
    expect(dashboardActive).not.toContain('role="button"');
    expect(dashboardActive).toContain(`:is="it.blockKey ? 'button' : 'div'"`);
    expect(dashboardActive).toContain('class="pr-bd-toggle" :aria-expanded="String(blockState(it.blockKey).expanded)" :aria-controls="blockDomId(it.blockKey)"');
  });
  it('destroys the burndown chart when the Progress card leaves the Burndown view', () => {
    expect(html).toMatch(/else if \(this\._burndownChart\) \{ this\._burndownChart\.destroy\(\); this\._burndownChart = null; \}/);
  });
  it('computes the sibling metrics only while the switch menu is open', () => {
    expect(html).toMatch(/if \(!this\.switchMenuOpen \|\| !list\.length\) return \[\];/);
    expect(dashboardActive).toContain('<template v-if="switchMenuOpen">');
  });
});

describe('project reporting view — calculations fix (B-071, B-072, B-074)', () => {
  const rStart = html.indexOf('renderBurndownChart() {');
  const render = html.slice(rStart, html.indexOf('exportChartPng() {', rStart));
  it('colours the left-over KPI from tokens, not a hex (B-070)', () => {
    const start = html.indexOf('kpiLeftColor(left, total) {');
    expect(start).toBeGreaterThan(-1);
    const body = html.slice(start, html.indexOf('showDashboard(pid) {', start));
    expect(body).toContain('var(--kpi-orange)');
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
  it('measures the Budget tile on fees only', () => {
    expect(dashboardActive).toContain('<template v-if="kpis.feesOnly">');
    expect(dashboardActive).toContain('of {{ formatMoney(kpis.feesOnly');
    expect(dashboardActive).toContain('kpiLeftColor(kpis.feesLeft, kpis.feesOnly)');
    expect(html).toContain('spentPercent(this.kpis.consumedEur, this.kpis.feesOnly)');
    expect(dashboardActive).not.toContain('kpis.budgetTotal');
  });
  it('shows "+ X PTC" outside the budget branches, so also under "No budget" (Review Focus 5)', () => {
    expect(dashboardActive).toMatch(/<span>No budget<\/span><\/div>\s*<\/template>\s*<div v-if="kpis.totalPtc > 0" class="pr-kpi-note">\+ \{\{ formatMoney\(kpis.totalPtc/);
    // The old PTC wording ("incl. X PTC"), in any form; the Hours tile's "incl. Xh dated after today" (B-080) is not it.
    expect(dashboardActive).not.toMatch(/incl\.[^<]*PTC/);
  });
  it('passes today to the burndown and labels the pill with the value as of today', () => {
    expect(html).toContain('billableData, billableTasks, findRate, this.reportToday)');
    expect(render).toContain('todayValue');
    expect(html).not.toContain('planningData');
  });
  it('labels the tooltip plan "Planned" and switches to it on future points', () => {
    expect(render).toContain('Planned:');
    expect(render).not.toContain('Estimated:');
    expect(render).toContain('item.datasetIndex === (burnValues[item.dataIndex] == null ? 1 : 0)');
  });
});

describe('project reporting view — Breakdown and Monthly fixes (B-073, B-075, B-076)', () => {
  it('computes the By area Total once and labels the Ungrouped row', () => {
    expect(html).toContain('areaTotalColumn(');
    expect(html).toContain("'Not in any functional area'");
  });
  it('explains overlapping areas under the table', () => {
    expect(dashboardActive).toContain(`v-if="breakdownView === 'area' && breakdownAreaOverlap"`);
    expect(dashboardActive).toContain('Some roles belong to more than one area: their hours count in each area and once in the Total.');
  });
  it('names the hours column after its source', () => {
    expect(dashboardActive).toMatch(/<th class="text-end" title="[^"]+">Planned hours \(resource plan\)<\/th>/);
    expect(dashboardActive).not.toContain('Est. hours');
  });
  it('exports the Monthly summary from data, not from the rendered table', () => {
    expect(dashboardActive).toContain('@click="exportMonthlyXls()"');
    expect(html).not.toContain('table_to_book');
  });
  it('uses an existing font-weight token', () => {
    expect(css).not.toContain('--weight-normal');
  });
});

describe('Breakdown v2 — menus', () => {
  const bStart = dashboard.indexOf('<!-- /pr-progress -->');
  const bEnd = dashboard.indexOf('<!-- /pr-breakdown -->');
  const card = dashboard.slice(bStart, bEnd);

  it('the Period menu is a Vue popover, not a Bootstrap dropdown', () => {
    expect(card).not.toContain('data-bs-toggle="dropdown"');
    expect(card).toContain('data-menu="period"');
    expect(card).toContain('data-menu-btn="period"');
  });
  it('picking a period closes the menu through closeMenu, not Bootstrap', () => {
    const m = html.match(/pickPeriod\(ym\) \{([\s\S]*?)\n {6}\},/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toContain('bootstrap.Dropdown');
    expect(m[1]).toContain('this.closeMenu()');
  });
  it('closes on a click outside and on Esc, and removes its listeners on unmount', () => {
    expect(html).toContain('closeMenu(restoreFocus = true)');
    expect(html).toMatch(/document\.addEventListener\('mousedown'/);
    expect(html).toMatch(/e\.key === 'Escape'/);
    const m = html.match(/beforeUnmount\(\) \{([\s\S]*?)\n {4}\},/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('this.removeMenuListeners()');
  });
});

describe('Breakdown v2 — Entries block', () => {
  const tStart = html.indexOf('<template id="pr-entries-tpl">');
  const tEnd = html.indexOf('\n</template>', tStart);
  const tpl = html.slice(tStart, tEnd);
  const bStart = dashboard.indexOf('<!-- /pr-progress -->');
  const bEnd = dashboard.indexOf('<!-- /pr-breakdown -->');
  const card = dashboard.slice(bStart, bEnd).replace(/<!--[\s\S]*?-->/g, '');

  it('locates the template, outside the Vue mount root', () => {
    expect(tStart).toBeGreaterThan(dashEnd);
    expect(tEnd).toBeGreaterThan(tStart);
  });
  it('carries the Entries copy', () => {
    ['Entries ·', ' of ', 'Export XLS', 'No entries in the selected period.', 'No entries match the selected filters.', 'Clear',
      'months without matching entries hidden', '1 month without matching entries hidden', 'Hours', 'Amount', 'Note'].forEach(t => expect(tpl, t).toContain(t));
  });
  it('carries the filter and column copy that the component builds', () => {
    ['Filter by role', 'Filter by resource', ' with entries in ', 'Role (resource)', 'Resource'].forEach(t => expect(html, t).toContain(t));
  });
  it('has sortable headers as buttons with aria-sort, and month buttons with aria-expanded and aria-controls', () => {
    expect(tpl).toContain('aria-sort');
    expect(tpl).toMatch(/<th[^>]*><button/);
    expect(tpl).toContain(':aria-expanded="String(m.open)"');
    expect(tpl).toContain(':aria-controls="monthId(m)"');
  });
  it('has no emoji and no hex', () => {
    expect(tpl).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(tpl).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('mounts the component in the card and no longer renders the entries inline', () => {
    expect(card).toContain('<pr-entries');
    expect(card).not.toContain('taskEntries(');
  });
  it('loads report-entries.js', () => {
    expect(html).toContain('js/lib/report-entries.js?v=1');
  });
});

describe('Breakdown v2 — By role and By functional area', () => {
  it('By role mounts the block with the Resource filter', () => {
    expect(html).toContain(`blockFilterKind(key) { return this.blockInfo(key).prefix === 'role' ? 'resource' : 'role'; }`);
    expect(html).toContain(`blockKey: 'role:' + cols[i].role + '|' + cols[i].task`);
  });
  it('By area lists its tasks as area-task rows with an "N tasks" subtitle and "N roles" under each', () => {
    expect(dashboardActive).toContain(`it.kind === 'area-task'`);
    expect(html).toContain(`(n === 1 ? ' task' : ' tasks')`);
    expect(html).toContain(`(col.roles === 1 ? ' role' : ' roles')`);
  });
  it('prunes the filters on a data reload too, not only on a Period change (review round 2)', () => {
    expect(html).toContain(`refreshTick() { this.attachCardGridObserver(); this.pruneEntryFilters(); },`);
    expect(html).toContain(`filterRange() { this.pruneEntryFilters(); },`);
  });
  it('closes a filter menu whose block collapses (review round 2)', () => {
    const m = html.match(/toggleBlock\(key\) \{([\s\S]*?)\n {6}\},/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('this.closeMenu(false)');
  });
  it('closes a filter menu under a collapsed area, on a view change and on a project switch (review round 3)', () => {
    expect(html).toContain(`menuKey.startsWith(key + '|')`);
    expect(html).toContain(`breakdownView() { if (this.openMenu && this.openMenu.startsWith('filter:')) this.closeMenu(false); },`);
    const m = html.match(/showDashboard\(pid\) \{([\s\S]*?)\n {6}\},/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('this.closeMenu(false)');
    expect(m[1]).toContain('this.hideSheet()');
  });
  it('finds a logged-only pair\'s entries whatever the case of its task (review round 1)', () => {
    expect(html).toContain(`this.taskDetailByLowerName[task.toLowerCase()]`);
  });
  it('exports per block: role_ and area_ prefixes, the area by its name', () => {
    expect(html).toContain(`return prefix + '_' + label.replace(`);
    expect(html).toContain(`this.dashboardProject.groups[Number(gi)].name`);
  });
  it('opening a task of an area closes the area\'s others', () => {
    expect(html).toContain(`k.startsWith(areaPrefix)) this.entriesState[k].expanded = false`);
  });
});

describe('Breakdown v2 — tablet and smartphone', () => {
  it('has the three bottom sheets as offcanvas-bottom', () => {
    for (const id of ['prFilterSheet', 'prSortSheet', 'prPeriodSheet']) {
      expect(html, id).toMatch(new RegExp(`class="offcanvas offcanvas-bottom pr-sheet"[^>]*id="${id}"`));
    }
  });
  it('carries the sheet and phone copy', () => {
    ['Sort entries', 'Applies inside each month', 'Ascending', 'Descending', 'Reset', 'Apply', 'By area', 'Clear', 'Spent <b>', ' · Remaining <b>']
      .forEach(t => expect(html, t).toContain(t));
  });
  it('uses the same smartphone and tablet thresholds in CSS and matchMedia', () => {
    expect(css).toContain('max-width: 767.98px');
    expect(css).toContain('max-width: 1279.98px');
    expect(html).toContain(`matchMedia('(max-width: 767.98px)')`);
  });
  it('removes the matchMedia listener on unmount', () => {
    expect(html).toContain(`this._phoneMq.removeEventListener('change', this._phoneMqHandler)`);
  });
});
