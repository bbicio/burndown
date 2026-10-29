import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('pipeline.html');
const css = read('css/pipeline.css');
const start = html.indexOf('id="pipelineBoardSection"');
// Whole page root: from the board section to the first modal (board AND detail panel).
const end = html.indexOf('<div class="modal', start);
const board = html.slice(start, end);

describe('pipeline board guard', () => {
  it('locates the board template', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(board).toContain('id="pbDetailPanel"');
  });

  it('pipeline.css is linked (versioned) by pipeline.html only', () => {
    expect(html).toMatch(/css\/pipeline\.css\?v=\d+/);
    const others = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'pipeline.html');
    others.forEach(f => expect(read(f), f).not.toContain('pipeline.css'));
  });

  it('has no hex colour literals in pipeline.css or the board template', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(board).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('board template has no v-html; page has no cardBudgetHtml/totalsHtml', () => {
    expect(board).not.toContain('v-html');
    expect(html).not.toContain('cardBudgetHtml');
    expect(html).not.toContain('totalsHtml');
  });

  it('board template has no emoji', () => {
    expect(board).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('every pipeline-calc.js reference is ?v=7', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/pipeline-calc\.js\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('7');
      }
    });
    expect(found).toBeGreaterThan(0);
  });

  it('every pipeline.css reference is ?v=5', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/pipeline\.css\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('5');
      }
    });
    expect(found).toBeGreaterThan(0);
  });

  it('column bodies have a thin scrollbar (2026-10-29, ui-quick-wins)', () => {
    expect(css).toMatch(/\.pb-col-body::-webkit-scrollbar\s*\{[^}]*width:\s*6px/);
    expect(css).toMatch(/\.pb-col-body::-webkit-scrollbar-thumb\s*\{[^}]*var\(--border-medium\)/);
    expect(css).toMatch(/\.pb-col-body::-webkit-scrollbar-thumb:hover\s*\{[^}]*var\(--text-muted\)/);
    const sup = css.indexOf('@supports not selector(::-webkit-scrollbar)');
    expect(sup).toBeGreaterThan(-1);
    const close = css.slice(sup).match(/\}\s*\}/);
    expect(close).not.toBeNull();
    const block = css.slice(sup, sup + close.index + close[0].length);
    expect(block).toMatch(/scrollbar-width:\s*thin/);
    expect(block).toMatch(/scrollbar-color:\s*var\(--border-medium\)\s+transparent/);
    // Outside @supports, Chrome 121+ would drop the ::-webkit-scrollbar rules.
    const outside = css.slice(0, sup) + css.slice(sup + block.length);
    expect(outside).not.toMatch(/scrollbar-(width|color)\s*:/);
  });

  it('PB_STAGE_STYLE Draft entry has no hex', () => {
    const m = html.match(/Draft:\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m[0]).not.toContain('#');
  });
});
