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

  it('every portfolio.css reference is ?v=2', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/portfolio\.css\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('2');
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
    const start = html.indexOf('dashboardSiblings.length');
    const end = html.indexOf('</div>', html.indexOf('</ul>', start));
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
