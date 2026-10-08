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

  it('portfolio.css is linked (versioned) by portfolio.html only', () => {
    expect(html).toMatch(/css\/portfolio\.css\?v=\d+/);
    const others = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'portfolio.html');
    others.forEach(f => expect(read(f), f).not.toContain('portfolio.css'));
  });

  it('has no hex colour literals in portfolio.css or the overview template', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(overviewActive).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('overview template has no emoji', () => {
    expect(overviewActive).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('every portfolio.css reference is ?v=1', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/portfolio\.css\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('1');
      }
    });
    expect(found).toBeGreaterThan(0);
  });
});
