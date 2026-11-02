// Guard over the project-config.html redesign (2026-11-02): the page head, the section index, the task table,
// the merged phasing card, the Tags section shared with costgrid.html, page hygiene and the responsive layout.
// Spec: docs/superpowers/specs/2026-11-02-project-config-redesign-design.md.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('shared tag rules', () => {
  const style = read('css/style.css');
  const cg = read('css/costgrid.css');
  const SELECTORS = [
    '.cg-section-header', '.cg-section-header:focus-visible', '.cg-section-chevron', '.cg-section-chevron--collapsed',
    '.cg-section-title', '.cg-section-toggle-label', '.cg-tag-groups', '.cg-tag-summary', '.cg-tag-summary-pill',
  ];
  it.each(SELECTORS)('%s lives in style.css, not in costgrid.css', (sel) => {
    expect(style).toContain(sel + ' {');
    expect(cg).not.toMatch(new RegExp('^' + esc(sel) + '\\s*\\{', 'm'));
  });
  it('keeps the cost-grid-only chevron rule in costgrid.css', () => {
    expect(cg).toContain('.cg-summary-bar .cg-section-chevron');
  });
});
