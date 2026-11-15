import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const SCRIPT = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const count = (s, needle) => s.split(needle).length - 1;

describe('xlsx version guard', () => {
  it('api/package.json pins xlsx to the vendor 0.20.3 tarball', () => {
    expect(JSON.parse(read('api/package.json')).dependencies.xlsx)
      .toBe('https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
  });

  it('api/package-lock.json resolves xlsx to 0.20.3', () => {
    const pkg = JSON.parse(read('api/package-lock.json')).packages['node_modules/xlsx'];
    expect(pkg.version).toBe('0.20.3');
    expect(pkg.integrity.startsWith('sha512-')).toBe(true);
  });

  it('pages load the same SheetJS 0.20.3 script and no 0.18.5', () => {
    expect(count(read('portfolio.html'), SCRIPT)).toBe(1);
    expect(count(read('project-config.html'), SCRIPT)).toBe(1);
    for (const f of readdirSync(process.cwd()).filter((n) => n.endsWith('.html'))) {
      expect(read(f), f).not.toContain('xlsx@0.18.5');
    }
  });

  it('the three actuals file inputs accept only .xlsx and the Load button says XLSX', () => {
    for (const f of ['portfolio.html', 'project-config.html', 'planning.html']) {
      const inputs = read(f).match(/<input type="file"[^>]*>/g) || [];
      expect(inputs.length, f).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(input, f).toContain('accept=".xlsx"');
        expect(input, f).not.toContain('accept=".xls,.xlsx"');
      }
    }
    const planning = read('planning.html').replace(/<!--[\s\S]*?-->/g, '');
    expect(planning).not.toMatch(/Load XLS(?!X)/);
    expect(count(planning, 'Load XLSX')).toBe(2);
  });
});
