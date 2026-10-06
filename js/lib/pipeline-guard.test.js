import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('pipeline.html');
const css = read('css/pipeline.css');
const start = html.indexOf('id="pipelineBoardSection"');
const end = html.indexOf('id="pbDetailPanel"');
const board = html.slice(start, end);

describe('pipeline board guard', () => {
  it('locates the board template', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
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

  it('every pipeline-calc.js reference is ?v=5', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    let found = 0;
    pages.forEach(f => {
      for (const m of read(f).matchAll(/pipeline-calc\.js\?v=(\d+)/g)) {
        found++;
        expect(m[1], f).toBe('5');
      }
    });
    expect(found).toBeGreaterThan(0);
  });

  it('PB_STAGE_STYLE Draft entry has no hex', () => {
    const m = html.match(/Draft:\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m[0]).not.toContain('#');
  });
});
