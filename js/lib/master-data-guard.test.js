import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

describe('Master Data sub-menu styles (css/style.css)', () => {
  const css = read('css/style.css');
  it('defines the layout, the menu and the content wrapper', () => {
    expect(css).toMatch(/\.md-layout\s*\{/);
    expect(css).toMatch(/\.md-subnav\s*\{/);
    expect(css).toMatch(/\.md-subnav a\.active\s*\{/);
    expect(css).toMatch(/\.md-content\s*\{/);
  });
  it('is a column beside the sidebar from 1024px up and a row below', () => {
    const wide = css.slice(css.indexOf('/* ── Master Data sub-navigation'));
    expect(wide).toMatch(/@media \(min-width: 1024px\)\s*\{[\s\S]*\.md-subnav[\s\S]*flex-direction:\s*column/);
  });
});
